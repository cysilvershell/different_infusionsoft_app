/*
* Change .attr to .data
*/

(function() {

  return {
    data: {},
    events: {
      'app.activated'                   : 'init',
      'click .contact-toggle'           : 'toggleContact',
      'click .contact h5'               : 'toggleContactSection',
      'click .groups h5'                : 'setGroupsForContact',
      'click .orders-subscriptions h5'  : 'setOrdersAndSubscriptionsForContact',
      'click .search-button'            : 'search',
      'click .toggle-search'            : 'toggleSearch',
      'ticket.requester.email.changed'  : 'search'
    },
    fields: {
      contact               : [ 'FirstName', 'LastName', 'StreetAddress1', 'StreetAddress2', 'City', 'State', 'PostalCode', 'Country', 'Company', 'DateCreated', 'Email', 'Groups', 'Id', 'JobTitle', 'Leadsource', 'OwnerID', 'Phone1' ],
      contactGroup          : [ 'Id', 'GroupName', 'GroupCategoryId' ],
      contactGroupAssign    : [ 'GroupId', 'DateCreated' ],
      contactGroupCategory  : [ 'Id', 'CategoryName' ],
      job                   : [ 'JobTitle', 'DateCreated', 'OrderStatus', 'JobStatus' ],
      owner                 : [ 'FirstName', 'LastName' ],
      product               : [ 'Id', 'ProductName' ],
      recurringOrder        : [ 'NextBillDate', 'SubscriptionPlanId', 'BillingAmt', 'Status' ],
      subscriptionPlan      : [ 'Id', 'ProductId' ]
    },
    requests: {
      'get' : function(request) { return request; }
    },

    // Methods
    activateContact: function(id) {
      var $contact = this.$('[data-id="' + id + '"]');

      // Set active class
      $contact.addClass('active');

      // Set additional contact content
      this.setOwnerForContact($contact);
    },

    createDataService: function() {
      var app         = this,
          serviceData = {
            privateKey: app.settings.token
          },

          // private
          _camelize = function(str) {
            return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
              if (+match === 0) return "";
              return index == 0 ? match.toLowerCase() : match.toUpperCase();
            });
          },
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
            var validate  = _validateResponse(xml),
                $structs;

            if (validate.valid && validate.$xml && ($structs = validate.$xml.find('struct'))) {
              return $structs.get().map(function(struct, index) {
                var member = { index: index };
                _.each(data.fields, function(field) {
                  member[_camelize(field)] = app.$(struct).find('name').filter(function(index, element) {
                    return app.$(element).text() === field;
                  }).next().text();
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
              return app.ajax('get', request).then(
                function(response) {
                  response = _parseResponse(response, data);
                  if (_.isArray(response)) {
                    done(response);
                  } else {
                    fail(response);
                  }
                },
                function(message) {
                  fail(message);
                }
              );
            }).fail(function(message) {
              services.notify(message, 'error');
            });
          },
          _validateResponse = function(xml) {
            var message   = '',
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
            return _sendRequest('dataService.load', {
              fields  : fields,
              table   : table,
              id      : id
            }).done(function(response) {
              done(_.first(response));
            }).fail(function(response) {
              fail(response);
            });
          }.bind(this));
        },
        query: function(table, fields, query, limit, page) {
          return _sendRequest('dataService.query', {
            limit   : limit   || 5,
            page    : page    || 0,
            query   : _mapQueryFields(query),
            fields  : fields,
            table   : table
          });
        }
      };
    },

    formatCurrency: function(value) {
      return value;
    },

    formatDate: function(value) {
      return value;
    },

    getGroups: function() {
      return this.dataService.query('ContactGroup', this.fields.contactGroup)
        .done(function(groups) {
          this.getGroupCategories(groups);
        }.bind(this));
    },

    getGroupCategories: function(groups) {
      return this.dataService.query('ContactGroupCategory', this.fields.contactGroupCategory)
        .done(function(categories) {
          // Assign categories to group
          this.data.groups = groups.map(function(group) {
            return _.extend(group, {
              groupCategoryName : _.find(categories, function(category) { return category.id === group.groupCategoryId; }).categoryName
            });
          });
        }.bind(this));
    },

    getContactGroups: function(id) {
      var self = this;
      return this.promise(function(done, fail) {
        return self.dataService.query('ContactGroupAssign', self.fields.contactGroupAssign, { contactId: id })
          .done(function(groups) {
            groups = groups.map(function(group) {
              var groupCategory = _.find(self.data.groups, function(grp) {
                return grp.id === group.groupId;
              });

              return _.extend(group, groupCategory);
            });
            done(groups);
          });
      });
    },

    getContactOwner: function(id) {
      return this.dataService.load('User', this.fields.owner, id);
    },

    getContacts: function(query) {
      if (_.isEmpty(query)) {
        return this.gotoMessage('Not a valid search');
      }

      // Show the loading screen
      this.gotoLoading();

      // Create request
      var request;
      if (this.isEmail(query)) {
        request = this.dataService.query('Contact', this.fields.contact, {
          Email: query
        });
      } else {
        request = this.dataService.query('Contact', this.fields.contact, {
          FirstName : query
        });
      }

      request.then(function(contacts) {
        this.data.contacts = contacts;
        this.gotoContacts();
      }.bind(this));
    },

    getProducts: function() {
      return this.dataService.query('Product', this.fields.product)
        .done(function(products) {
          this.data.products = products;
        }.bind(this));
    },

    getSubscriptionPlans: function(products) {
      return this.dataService.query('SubscriptionPlan', this.fields.subscriptionPlan)
        .done(function(subscriptionPlans) {
          this.data.subscriptionPlans = subscriptionPlans.map(function(subscriptionPlan) {
            return _.extend(subscriptionPlan, {
              productName: _.find(products, function(product) { return product.id === subscriptionPlan.productId; }).productName
            });
          });
        }.bind(this));
    },

    gotoContacts: function() {
      var matches = this.data.contacts.length;

      // Render contacts
      this.switchTo('contacts', {
        contacts  : this.data.contacts,
        matches   : matches,
        more      : matches > 5,
        subdomain : this.settings.subdomain
      });

      if (matches > 0) {
        this.activateContact(_.first(this.data.contacts).id);
      }
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

    init: function(data) {
      if (!data.firstLoad) {
        return;
      }

      // Show loading screen, using this instead of
      // defaultState since we are using a generic
      // template to display a translated message
      this.gotoLoading();

      // Create services
      this.dataService = this.createDataService();

      // Preload data
      this.getGroups()
        .done(function() {
           // Initial load of contacts by email
          this.getContacts(this.ticket().requester().email());
        }.bind(this));

      this.getProducts()
        .done(function(products) {
          this.getSubscriptionPlans(products);
        }.bind(this));
    },

    isEmail: function(value) {
      return value.indexOf('@') !== -1;
    },

    search: function() {
      this.getContacts(this.$().find('.search-input').val());
    },

    setGroupsForContact: function(e) {
      var $section  = this.$(e.currentTarget).parent(),
          $content  = $section.find('.content'),
          $contact  = $section.parents('.contact'),
          contactId = $contact.data('id'),
          $groups;

      // Check to see if we have done this before
      if (_.isUndefined($contact.data('groups-loaded'))) {
        this.getContactGroups(contactId)
          .done(function(groups) {
            // Generate template
            $groups = this.renderTemplate('groups', { groups: groups });

            // Append content
            $content.html($groups);
          }.bind(this))
          .always(function() {
            // Set loaded state
            $contact.data('groups-loaded', true);
          });
      }
    },

    setOrdersAndSubscriptionsForContact: function(e) {
      var $section  = this.$(e.currentTarget).parent(),
          $contact  = $section.parents('.contact'),
          contactId = $contact.data('id');

      // Check to see if we have done this before
      if (_.isUndefined($contact.data('orders-loaded'))) {

        // Get data for orders
        this.dataService.query('Job', this.fields.job, { contactId: contactId })
          .done(function(orders) {
            // Generate template
            var $orders = this.renderTemplate('orders', { orders: orders });

            // Append content
            $section.find('.orders').html($orders);
          }.bind(this));


        // Get data for subscriptions
        this.dataService.query('RecurringOrder', this.fields.recurringOrder, { contactId: contactId })
          .done(function(subscriptions) {
            // Map subscriptions for contact to data
            subscriptions = subscriptions.map(function(subscription) {
              return _.extend(subscription, {
                productName: _.find(this.data.subscriptionPlans, function(subscriptionPlan) { return subscriptionPlan.id === subscription.subscriptionPlanId; }).productName
              });
            }.bind(this));

            // Generate template
            var $subscriptions = this.renderTemplate('subscriptions', { subscriptions: subscriptions });

            // Append content
            $section.find('.subscriptions').html($subscriptions);
          }.bind(this))
          .always(function() {
            // Set loaded state
            $contact.data('orders-loaded', true);
          });
      }
    },

    setOwnerForContact: function($contact) {
      var $owner = $contact.find('.owner p');
      if (_.isUndefined($contact.data('owner-loaded'))) {
        this.getContactOwner($contact.data('owner-id'))
          .done(function(owner) {
            $owner.text('%@ %@'.fmt(owner.firstName, owner.lastName));
          })
          .fail(function() {
            $owner.text('Could not find owner info');
          })
          .always(function() {
            $contact.data('owner-loaded', true);
          });
      }
    },

    toggleContact: function(e) {
      var $toggle   = this.$(e.currentTarget),
          $icon     = $toggle.find('i'),
          $contact  = $toggle.parents('.contact'),
          $contacts = this.$().find('.contact').not($contact);

      $contacts.removeClass('active');
      this.activateContact($contact.data('id'));
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
