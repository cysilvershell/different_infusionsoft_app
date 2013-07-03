(function() {

  return {
    API_MAX_RESULTS: 5,
    FORMAT_DATE: new RegExp(/^(\d{4})(\d{2})(\d{2})/),
    data: {},
    events: {
      'app.activated'                   : 'init',
      'click .contact'                  : 'toggleContact',
      'click .contact h5'               : 'toggleContactSection',
      'click .groups h5'                : 'setGroupsForContact',
      'click .orders-subscriptions h5'  : 'setOrdersAndSubscriptionsForContact',
      'click .search-button'            : 'search',
      'click .toggle-search'            : 'toggleSearch',
      'keypress .search-input'          : 'searchOnEnter',
      'ticket.requester.email.changed'  : 'searchByRequester'
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
              return index === 0 ? match.toLowerCase() : match.toUpperCase();
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
                  $value = app.$(struct).find('name').filter(function(index, element) { return app.$(element).text() === field; }).next(),
                  value  = $value.text();

                  // Match date element nodes so we can format them
                  if ($value.find('dateTime\\.iso8601').length > 0) {
                    value = app.formatDate(value);
                  }
                  member[_camelize(field)] = value;
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
              if ($fault.length > 0) {
                message = $fault.find('name:contains("faultString")').next().text();
              } else { valid = true; }
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
            limit   : limit   || app.API_MAX_RESULTS,
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
      if (_.isString(value)) {
        return this.FORMAT_DATE.exec(value).slice(1).join('/');
      }
      return value;
    },

     // Assign categories to group
    getGroupCategories: function(groups) {
      return this.dataService.query('ContactGroupCategory', this.fields.contactGroupCategory)
        .done(function(categories) {
          this.data.groups = groups.map(function(group) {
            return _.extend(group, {
              groupCategoryName : _.find(categories, function(category) { return category.id === group.groupCategoryId; }).categoryName
            });
          });
        }.bind(this));
    },

    getGroups: function() {
      return this.dataService.query('ContactGroup', this.fields.contactGroup)
        .done(function(groups) {
          this.getGroupCategories(groups);
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
      if (id) { return this.dataService.load('User', this.fields.owner, id); }
      return this.reject;
    },

    getContacts: function(query) {
      if (_.isEmpty(query)) {
        return this.gotoMessage(this.I18n.t('search.invalid'));
      }

      this.gotoLoading();

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

      request.done(function(contacts) {
        contacts = contacts.map(function(contact) {
          if ((contact.firstName + contact.lastName).length === 0) { contact.firstName = '--'; }
          return contact;
        });
        this.gotoContacts(contacts);
      }.bind(this));
    },

    getProducts: function() {
      return this.dataService.query('Product', this.fields.product);
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

    gotoContacts: function(contacts) {
      var matches = contacts.length;
      this.switchTo('contacts', {
        contacts  : contacts,
        matches   : matches,
        more      : matches >= this.API_MAX_RESULTS
      });

      if (matches > 0) {
        this.activateContact(_.first(contacts).id);
      }
    },

    gotoLoading: function() {
      this.gotoMessage(this.I18n.t('global.loadingLong'), this.I18n.t('global.loading'));
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

      this.gotoLoading();
      this.dataService = this.createDataService();
      this.reject      = this.promise(function(done, fail) { fail(); });

      // Preload data
      this.getGroups()
        .done(function() {
          this.searchByRequester();
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
      this.getContacts(this.$('.search-input').val());
    },

    searchByRequester: function() {
      var requester = this.ticket().requester();
      if (!requester) { return; }
      this.getContacts(requester.email());
    },

    searchOnEnter: function(e) {
      if (e.charCode === 13) {
        this.search();
      }
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
            var $orders = this.renderTemplate('orders', { orders: orders });
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

            var $subscriptions = this.renderTemplate('subscriptions', { subscriptions: subscriptions });
            $section.find('.subscriptions').html($subscriptions);
          }.bind(this))
          .always(function() {
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
            $owner.text(this.I18n.t('contact.details.ownerEmpty'));
          }.bind(this))
          .always(function() {
            $contact.data('owner-loaded', true);
          });
      }
    },

    toggleContact: function(e) {
      var $contact  = this.$(e.currentTarget),
          $contacts = this.$('.contact').not($contact);

      if (!$contact.hasClass('active')) {
        $contacts.removeClass('active');
        this.activateContact($contact.data('id'));
      }
    },

    toggleContactSection: function(e) {
      var $heading  = this.$(e.currentTarget),
          $section  = $heading.parent();

      $section.toggleClass('active', !$section.hasClass('active'));
    },

    toggleSearch: function(e) {
      this.$('.search').toggleClass('active');
    }
  };
}());
