(function() {

  return {
    data: {},
    events: {
      'app.activated'                   : 'init',
      'click .contact-toggle'           : 'toggleContact',
      'click .contact h5'               : 'toggleContactSection',
      'click .groups h5'                : 'getGroupsForContact',
      'click .orders-subscriptions h5'  : 'getOrdersAndSubscriptionsForContact',
      'click .goto-search'              : 'gotoSearch',
      'click .search-button'            : 'onSearch',
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
          };

      return {
        load: function(table, fields, id) {
          return app.promise(function(done, fail) {
            if (id > 0) {
              this._sendRequest('dataService.load', {
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
          return this._sendRequest('dataService.query', {
            limit   : limit   || 1000,
            page    : page    || 0,
            query   : query   || [],
            fields  : fields,
            table   : table
          });
        },

        // private
        _createRequest: function(xml) {
          return {
            contentType : 'application/xml',
            data        : xml,
            dataType    : 'xml',
            proxy_v2    : true,
            type        : 'POST',
            url         : 'https://%@.infusionsoft.com/api/xmlrpc'.fmt(app.settings.subdomain)
          };
        },
        _createTemplate: function(templateName, data) {
          return app.renderTemplate(templateName, _.extend(serviceData, data));
        },
        _parseResponse: function(xml, data) {
          var validate  = this._validateResponse(xml),
              response  = [],
              $structs;

          if (validate.valid && validate.$xml && ($structs = validate.$xml.find('struct'))) {
            return $structs.get().map(function(struct) {
              var member = {};
              _.each(data.fields, function(field) {
                member[field] = app.$(struct).find('name:contains("' + field + '")').next().text();
              });
              return member;
            });
          }
          return validate.message;
        },
        _sendRequest: function(templateName, data) {
          var template = this._createTemplate(templateName, data),
              request  = this._createRequest(template),
              self     = this;

          return app.promise(function(done, fail) {
            app.ajax('get', request).then(function(response) {
              var response = self._parseResponse(response, data);
              if (_.isArray(response)) {
                done(response);
              } else {
                fail(response);
              }
            });
          }).fail(function(message) {
            app.gotoMessage(message);
          });
        },
        _validateResponse: function(xml) {
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
          this.getContacts('kiran@zendesk.com'); //TODO: this.ticket().requester().email());
        }.bind(this));
    },

    getContactOwner: function(id) {
      return this.dataService.load('User', [ 'FirstName', 'LastName' ], id);
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
        request = this.dataService.query('Contact', fields);
      } else {
        // TODO
      }

      request.then(
        function(contacts) {

          // Need to work out the owner info
          contacts = contacts.map(function(contact) {
            this.getContactOwner(contact.OwnerID).done(function(owner) {
              console.log('HERE', owner);
            });

            return _.extend(contact, {
              Owner: {
                FirstName : 'Travers',
                LastName  : 'McInerney'
              }
            });
          }.bind(this));

          this.gotoContacts(contacts);
        }.bind(this),

        function(message) {
          console.log(message);
        }
      );
    },

    getElementsForSection: function(e) {
      var $heading = this.$(e.currentTarget),
          $section = $heading.parent(),
          $content = $section.find('.content'),
          $contact = $section.parents('.contact');

      return {
        $contact  : $contact,
        $content  : $content,
        $heading  : $heading,
        $section  : $section
      };
    },

    getGroupsForContact: function(e) {
      var elements  = this.getElementsForSection(e),
          contactId = elements.$contact.data('contact');

      // Exit if we have already attempted to load data
      if (elements.$section.data('loaded')) {
        return;
      }

      // Get groups for each contact
      this.dataService.query('ContactGroupAssign', [ 'GroupId', 'ContactGroup', 'DateCreated' ], [{ name: 'ContactId', value: contactId }])
        .done(function(response, state) {
          var contactGroups = this.dataService.parseResponse(response, state).map(function(contactGroup) {
            return {
              category  : _.filter(this.data.groups, function(group) { console.log(group.Id, contactGroup); return group.Id === contactGroup.GroupId; }),
              created   : contactGroup.DateCreated,
              id        : contactGroup.GroupId,
              name      : contactGroup.ContactGroup
            };
          }.bind(this));

          // Generate template
          var $groups = this.renderTemplate('groups', {
            groups: contactGroups
          });

          // Append content
          elements.$content.html($groups);

          // Set state to loaded
          elements.$section.attr('loaded', true);
        }.bind(this))
        .fail(function() {
          this.gotoMessage('Could not load data...');
        });
    },

    getOrdersAndSubscriptionsForContact: function(e) {
      var elements = this.getElementsForSection(e);
      console.log(111);
    },

    gotoContacts: function(contacts) {
      var templateData = {
        contacts  : contacts,
        matches   : contacts.length,
        subdomain : this.settings.subdomain
      };

      if (contacts.length > 0) {
        this.switchTo('contacts', templateData);
        return;
      }

      this.gotoMessage('We\'re sorry but it appears we were unable to match this end-user with an Infusionsoft contact. You can try searching instead', 'Contact not found');
    },

    gotoIndex: function() {
      this.switchTo('contacts');
    },

    gotoLoading: function() {
      this.gotoMessage('Please wait. Loading data...','Loading');
    },

    gotoMessage: function(message, title) {
      this.switchTo('message', {
        message : message || this.I18n.t('message.default.message'),
        title   : title   || this.I18n.t('message.default.title')
      });
    },

    gotoSearch: function() {
      this.switchTo('search', {
        query: 'something'
      });
    },

    isEmail: function(value) {
      return true;
    },

    onSearch: function() {
      var query = this.$().find('.search-input').val();
      this.getContacts(query);
    },

    toggleContact: function(e) {
      var $toggle   = this.$(e.currentTarget),
          $icon     = $toggle.find('i'),
          $contact  = $toggle.parents('.contact').toggleClass('inactive'),
          isActive  = $contact.hasClass('inactive');

      // TODO: This can be nicer
      $icon.prop('class', '').addClass( isActive ? 'icon-chevron-down' : 'icon-chevron-up' );
    },

    toggleContactSection: function(e) {
      var $heading  = this.$(e.currentTarget),
          $contact  = $heading.parents('.contact'),
          $section  = $heading.parent(),
          $sections = $contact.find('section').not($section);

      $section.addClass('active');
      $sections.removeClass('active');
    }
  };

}());
