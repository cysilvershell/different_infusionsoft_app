(function() {

  return {
    data: {},
    events: {
      'app.activated'                   : 'init',
      'click .contact-toggle'           : 'toggleContact',
      'click .contact h5'               : 'toggleContactSection',
      'click .groups h5'                : 'getGroupsForContact',
      'click .orders-subscriptions h5'  : 'getOrdersAndSubscriptionsForContact',
      'click .search-button'            : 'onSearch',
      'click .toggle-search'            : 'toggleSearch',
      'ticket.requester.email.changed'  : 'onSearch'
    },
    requests: {
      'get' : function(request) { return request; }
    },

    // Initialization
    init: function(data) {
      if (!data.firstLoad) {
        return;
      }

      // Create services
      this.dataService = this.createDataService();

      // Load dependencies, which also performs initial contact search
      this.gotoLoading();
      this.getContactGroups();
    },

    createDataService: function() {
      var app         = this,
          serviceData = {
            privateKey: app.settings.token
          },

          // private
          _createRequest = function(xml) {
            return {
              contentType : 'application/xml',
              data        : xml,
              dataType    : 'xml',
              proxy_v2    : true,
              type        : 'POST',
              url         : 'https://%@.infusionsoft.com/api/xmlrpc'.fmt(app.settings.subdomain)
            };
          },
          _createTemplate = function(templateName, data) {
            return app.renderTemplate(templateName, _.extend(serviceData, data));
          },
          _mapQueryFields = function(query) {
            if (_.isObject(query)) {
              var keys   = _.keys(query),
                  values = _.values(query);

              return _.map(keys, function(key, index) {
                var value = values[index];
                return {
                  name  : key,
                  type  : typeof(value),
                  value : value
                };
              });
            }
          },
          _parseResponse = function(xml, data) {
            var validate = _validateResponse(xml),
                $structs;

            if (validate.valid && validate.$xml && ($structs = validate.$xml.find('struct'))) {
              return $structs.get().map(function(struct, index) {
                var member = {
                  index: index
                };
                _.each(data.fields, function(field) {
                  member[field] = app.$(struct).find('name:contains("' + field + '")').next().text();
                });
                return member;
              });
            }
            return validate.message;
          },
          _sendRequest = function(templateName, data) {
            var template = _createTemplate(templateName, data),
                request  = _createRequest(template),
                self     = this;

            return app.promise(function(done, fail) {
              app.ajax('get', request).then(
                function(response) {
                  var response = _parseResponse(response, data);
                  if (_.isArray(response)) {
                    done(response);
                  } else {
                    fail(response);
                  }
                },
                function(message) {
                  fail();
                }
              );
            }).fail(function(message) {
              app.gotoMessage(message);
            });
          },
          _validateResponse = function(xml) {
            var message   = 'DEFAULT MESSAGE',
                valid     = false,
                $fault,
                $xml;

            if (xml && ($xml = app.$(xml))) {
              $fault  = $xml.find('fault');
              if ($fault.length > 0) { message = $fault.find('name:contains("faultString")').next().text(); }
              else { valid = true; }
            }

            return {
              $xml    : $xml,
              message : message,
              valid   : valid
            };
          };

      return {
        load: function(table, fields, id) {
          return app.promise(function(done, fail) {
            if (id > 0) {
              _sendRequest('dataService.load', {
                fields  : fields,
                table   : table,
                id      : id
              }).done(function(response) {
                done(_.first(response));
              });
            }
          }.bind(this));
        },
        query: function(table, fields, query, limit, page) {
          return _sendRequest('dataService.query', {
            limit   : limit   || 1000,
            page    : page    || 0,
            query   : _mapQueryFields(query),
            fields  : fields,
            table   : table
          });
        }
      };
    },

    getContactGroups: function() {
      return this.dataService.query('ContactGroup', [ 'Id', 'GroupName', 'GroupCategoryId' ])
        .done(function(groups) {
          this.getContactGroupCategories(groups);
        }.bind(this));
    },

    getContactGroupCategories: function(groups) {
      return this.dataService.query('ContactGroupCategory', [ 'Id', 'CategoryName' ])
        .done(function(categories) {

          // Assign categories to group, TODO: Would be nicer without using global variable
          this.data.groups = groups.map(function(group) {
            return _.extend(group, {
              GroupCategoryName: _.find(categories, function(category) { return category.Id === group.GroupCategoryId; }).CategoryName
            });
          });

          // Initial load of contacts by email
          this.getContacts(this.ticket().requester().email());
        }.bind(this));
    },

    getContactOwner: function(contact) {
      return this.dataService.load('User', [ 'FirstName', 'LastName' ], contact.OwnerID).done(function(owner) {
        contact.Owner = owner;
      });
    },

    getContacts: function(query) {
      if (_.isEmpty(query)) {
        return this.gotoMessage('Not a valid search');
      }

      // Show the loading screen
      this.gotoLoading();

      // Create request
      var request, fields = [ 'FirstName', 'LastName', 'StreetAddress1', 'StreetAddress2', 'City', 'State', 'PostalCode', 'Country', 'Company', 'DateCreated', 'Email', 'Groups', 'Id', 'JobTitle', 'Leadsource', 'OwnerID', 'Phone1' ];
      if (this.isEmail(query)) {
        request = this.dataService.query('Contact', fields, {
          Email: query
        });
      } else {
        request = this.dataService.query('Contact', fields, {
          FirstName : query,
          LastName  : query
        });
      }

      request.then(function(contacts) {
        this.data.contacts = contacts;
        this.gotoContacts(contacts);
      }.bind(this));
    },

    getGroupsForContact: function(e) {
      var $heading  = this.$(e.currentTarget),
          $section  = $heading.parent(),
          $content  = $section.find('.content'),
          $contact  = $section.parents('.contact'),
          contactId = $contact.data('contact');

      // Exit if we have already attempted to load data
      if ($section.data('loaded')) {
        return;
      }

      // Get groups for each contact
      this.dataService.query('ContactGroupAssign', [ 'ContactId', 'GroupId', 'ContactGroup', 'DateCreated' ], {
        ContactId: contactId
      }).done(function(groups) {
          groups = groups.map(function(contactGroup) {
            return {
              category  : _.filter(this.data.groups, function(group) { return group.Id === contactGroup.GroupId; }),
              created   : contactGroup.DateCreated,
              id        : contactGroup.GroupId,
              name      : contactGroup.ContactGroup
            };
          }.bind(this));

          // Generate template
          var $groups = this.renderTemplate('groups', {
            groups: groups
          });

          // Append content
          $content.html($groups);

          // Set state to loaded
          $section.attr('loaded', true);
        }.bind(this));
    },

    getOrdersAndSubscriptionsForContact: function(e) {
      var elements = this.getElementsForSection(e);
    },

    gotoContacts: function(contacts) {
      var matches = contacts.length,
          templateData = {
            contacts  : contacts,
            matches   : matches,
            more      : matches > 5,
            subdomain : this.settings.subdomain
          };

      if (contacts.length > 0) {
        this.getContactOwner(_.first(contacts)).done(function(owner) {
          this.switchTo('contacts', templateData);
          var $contact = this.$('.contact:first-child');
          $contact.find('.owner p').text('%@ %@'.fmt(owner.FirstName, owner.LastName));
          $contact.addClass('active');
        }.bind(this));
      } else {
        this.gotoMessage('We\'re sorry but it appears we were unable to match this end-user with an Infusionsoft contact. You can try searching instead', 'Contact not found');  
      }
    },

    gotoIndex: function() {
      this.switchTo('contacts');
    },

    gotoLoading: function() {
      this.gotoMessage('Please wait, loading data...','Loading');
    },

    gotoMessage: function(message, title) {
      this.switchTo('message', {
        message : message || this.I18n.t('message.default.message'),
        title   : title   || this.I18n.t('message.default.title')
      });
    },

    isEmail: function(value) {
      return value.indexOf('@') !== -1;
    },

    onSearch: function() {
      this.getContacts(this.$().find('.search-input').val());
    },

    toggleContact: function(e) {
      var $toggle   = this.$(e.currentTarget),
          $icon     = $toggle.find('i'),
          $contact  = $toggle.parents('.contact'),
          $contacts = this.$().find('.contact').not($contact);

      // Get contact owner
      if (!$contact.hasClass('active') && !$contact.data('owner')) {
        var contactId = $contact.data('contact').toString(),
            contact   = this.data.contacts.findProperty('Id', contactId);

        this.getContactOwner(contact).done(function(owner) {
          $contact.find('.owner p').text('%@ %@'.fmt(owner.FirstName, owner.LastName));
          $contact.attr('data-owner', true);
        });
      }

      $contacts.removeClass('active');
      $contact.addClass('active');
    },

    toggleContactSection: function(e) {
      var $heading  = this.$(e.currentTarget),
          $contact  = $heading.parents('.contact'),
          $section  = $heading.parent(),
          $sections = $contact.find('section').not($section);

      $section.addClass('active');
      $sections.removeClass('active');
    },

    toggleSearch: function(e) {
      this.$('.search').toggleClass('active');
    }
  };

}());
