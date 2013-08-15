(function() {

  return {
    API_MAX_RESULTS_DEFAULT: 5,
    API_MAX_RESULTS_GROUPS: 250,
    FORMAT_DATE: new RegExp(/^(\d{4})(\d{2})(\d{2})/),
    events: {
      'app.activated'                   : 'init',
      'click .add-tag'                  : 'addTag',
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
      contact               : [ 'FirstName', 'LastName', 'StreetAddress1', 'StreetAddress2', 'City', 'State', 'PostalCode', 'Country', 'Company', 'DateCreated', 'Email', 'Groups', 'Id', 'JobTitle', 'Leadsource', 'OwnerID', 'Phone1', 'Phone1Ext', 'Phone1Type' ],
      contactGroup          : [ 'Id', 'GroupName', 'GroupCategoryId' ],
      contactGroupAssign    : [ 'GroupId', 'DateCreated' ],
      contactGroupCategory  : [ 'Id', 'CategoryName' ],
      invoice               : [ 'JobId', 'InvoiceTotal', 'PayStatus' ],
      job                   : [ 'Id', 'JobTitle', 'DueDate' ],
      owner                 : [ 'FirstName', 'LastName' ],
      product               : [ 'Id', 'ProductName' ],
      recurringOrder        : [ 'NextBillDate', 'ProductId', 'BillingAmt', 'Status' ]
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

    addTag: function(e) {
      var $btn        = this.$(e.currentTarget),
          $select     = $btn.prev('select'),
          $contact    = $btn.parents('.contact'),
          contactId   = $contact.data('id'),
          groupId     = $select.val() * 1; // Make it a number

      // Check to see that something is selected
      if (groupId > 0) {
        this.dataService.addContactToGroup(contactId, groupId).done(function(success) {
          if (success) {
            services.notify(this.I18n.t('addTag.success'));
            $contact.find('.groups h5').trigger('click');
          } else {
            services.notify(this.I18n.t('addTag.error'), 'error');
          }
        }.bind(this));
      }
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

            if (validate.valid && validate.$xml) {
              // Response contains fields, so let's parse them
              if (data.fields && ($structs = validate.$xml.find('struct'))) {
                return $structs.get().map(function(struct, index) {
                  var member = { index: index };
                  _.each(data.fields, function(field) {
                    var $value = app.$(struct).find('name').filter(function(index, element) {
                      return app.$(element).text() === field;
                    }).next(),
                    value  = $value.text();

                    // Match date element nodes so we can format them
                    if ($value.find('dateTime\\.iso8601').length > 0) {
                      value = app.formatDate(value);
                    }
                    member[_camelize(field)] = value;
                  });
                  return member;
                });
              } else {
                return validate.$xml.find('boolean').text() === '1';
              }
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
                  if (_.isArray(response) || _.isBoolean(response)) {
                    done(response);
                  } else {
                    fail(response);
                  }
                },
                function(response) {
                  if (response.status === 502) {
                    app.gotoMessage(app.I18n.t('message.badGateway.message'));
                  } else {
                    fail();
                  }
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
        addContactToGroup: function(contactId, groupId) {
          return _sendRequest('dataService.addContactToGroup', {
            contactId: contactId,
            groupId: groupId
          });
        },
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
            limit   : limit   || app.API_MAX_RESULTS_DEFAULT,
            page    : page    || 0,
            query   : _mapQueryFields(query),
            fields  : fields,
            table   : table
          });
        }
      };
    },

    formatDate: function(value) {
      if (_.isString(value)) {
        var dateParts = this.FORMAT_DATE.exec(value).slice(1);
        return '%@/%@/%@'.fmt(dateParts[1], dateParts[2], dateParts[0]);
      }
      return value;
    },

    getCategories: function() {
      if (_.isEmpty(this.data.categories)) {
        return this.dataService.query('ContactGroupCategory', this.fields.contactGroupCategory, null, this.API_MAX_RESULTS_GROUPS)
          .done(function(categories) {
            this.data.categories = _.map(categories, function(category) {
              category.groups = [];
              return category;
            });
          }.bind(this));
      }

      return this.promise(function(done) {
        done(this.data.categories);
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

      var queryFields, request;
      if (this.isEmail(query)) {
        queryFields = { Email: query };
      } else {
        queryFields = {
          FirstName : query
        };
      }
      request = this.dataService.query('Contact', this.fields.contact, queryFields);

      request.done(function(contacts) {
        contacts = contacts.map(function(contact) {
          if ((contact.firstName + contact.lastName).length === 0) { contact.firstName = '--'; }
          return contact;
        });
        this.gotoContacts(contacts);
      }.bind(this));
    },

    getGroupCategories: function() {
      var self = this;
      if (_.isEmpty(self.data.groupCategories)) {
        return self.when(self.getGroups(), self.getCategories()).done(function() {

          // Create mapping object between groups and categories
          self.data.groupCategories = self.data.groups.map(function(group) {

            var category = _.find(self.data.categories, function(category) {
              var matches = category.id === group.groupCategoryId;
              if (matches) { category.groups.push(group); }
              return matches;
            });

            if (category) {
              return _.extend(group, {
                groupCategoryName: category.categoryName
              });
            }
            return group;
          });
        });
      }

      return self.promise(function(done) {
        done(self.data.groupCategories);
      });
    },

    getGroups: function() {
      var self = this;
      if (_.isEmpty(self.data.groups)) {
        return self.dataService.query('ContactGroup', self.fields.contactGroup, null, self.API_MAX_RESULTS_GROUPS)
          .done(function(groups) {
            self.data.groups = groups;
          });
      }

      return self.promise(function(done) {
        done(self.data.groups);
      });
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
        more      : matches >= this.API_MAX_RESULTS_DEFAULT
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
      this.data        = {};
      this.dataService = this.createDataService();
      this.reject      = this.promise(function(done, fail) { fail(); });

      this.searchByRequester();
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

      // Set visibility
      $section.addClass('active');

      this.getGroupCategories().done(function() {
        // Get the contact specific groups
        this.getContactGroups(contactId).done(function(groups) {
          // Generate template and append content
          $groups = this.renderTemplate('groups', {
            categories: this.data.categories,
            contactGroups: groups,
            groups: this.data.groups
          });
          $content.html($groups);
        }.bind(this));
      }.bind(this));
    },

    setOrdersAndSubscriptionsForContact: function(e) {
      var $section  = this.$(e.currentTarget).parent(),
          $contact  = $section.parents('.contact'),
          contactId = $contact.data('id');

      // Check to see if we have done this before
      if (_.isUndefined($contact.data('orders-loaded'))) {

        // Get the invoices for the contact
        this.dataService.query('Invoice', this.fields.invoice, { contactId: contactId }).done(function(invoices) {
          // Get data for orders
          this.dataService.query('Job', this.fields.job, { contactId: contactId })
            .done(function(orders) {

              // Map Job to Invoice
              orders = orders.map(function(order) {
                var invoice = _.find(invoices, function(invoice) {
                  return invoice.jobId === order.id;
                });
                return _.extend(order, {
                  invoiceTotal: invoice.invoiceTotal,
                  payStatus:    invoice.payStatus === '1'
                });
              });
              var $orders = this.renderTemplate('orders', { orders: orders });
              $section.find('.orders').html($orders);
            }.bind(this));

        }.bind(this));

        // Get product information
        this.getProducts().done(function(products) {

          // Get data for subscriptions
          this.dataService.query('RecurringOrder', this.fields.recurringOrder, { contactId: contactId })
            .done(function(subscriptions) {

              // Map subscriptions for contact to data
              subscriptions = subscriptions.map(function(subscription) {
                return _.extend(subscription, {
                  productName: _.find(products, function(product) { return product.id === subscription.productId; }).productName
                });
              }.bind(this));

              var $subscriptions = this.renderTemplate('subscriptions', { subscriptions: subscriptions });
              $section.find('.subscriptions').html($subscriptions);
            }.bind(this))
            .always(function() {
              $contact.data('orders-loaded', true);
            });
          }.bind(this));
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
