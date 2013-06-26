/*globals */
(function() {

  // Constants
  var API_CONTACT_NAME_FIELDS     = [ 'FirstName', 'LastName' ],
      API_CONTACT_ADDRESS_FIELDS  = [ 'StreetAddress1', 'StreetAddress2', 'City', 'State', 'PostalCode', 'Country' ],
      API_CONTACT_DETAIL_FIELDS   = API_CONTACT_NAME_FIELDS.concat(API_CONTACT_ADDRESS_FIELDS, [ 'Address1Type',  'Company', 'DateCreated', 'Email', 'Groups', 'Id', 'JobTitle', 'Leadsource', 'OwnerID', 'Phone1' ]),
      API_MAX_RESULTS             = 5,
      API_URL                     = 'https://%@.infusionsoft.com/api/xmlrpc',
      EMAIL_REGEX                 = '';

  return {
    // Constants

    events: {
      'app.activated'                   : 'init',
      // 'click .back'                     : 'gotoContacts',
      'click .contact-toggle'           : 'toggleContact',
      'click .contact h5'               : 'toggleContactSection',
      // 'click .goto-search'              : 'gotoSearch',
      // 'click .search-button'            : 'onSearch',
      // 'get.done'                        : 'loadContactResults', // 200 returned on API error
      // 'get.fail'                        : function() { this.gotoMessage(); },
      // 'ticket.requester.email.changed'  : 'onSearch'
      // 'keypress .search-input'    : 'onSearch'
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
      this.contactService = this.createContactService();
      this.dataService    = this.createDataService();

      // Perform default search-input
      this.getContacts(this.ticket().requester().email());
    },

    createService: function() {
      var app           = this,
          serviceData   = {
            privateKey: app.settings.token
          };

      return {
        app: app,
        data: null,
        createRequest: function(template) {
          return {
            contentType : 'application/xml',
            data        : template,
            dataType    : 'xml',
            proxy_v2    : true,
            type        : 'POST',
            url         : API_URL.fmt(app.settings.subdomain)
          };
        },
        createTemplate: function(name, data) {
          return app.renderTemplate(name, _.extend(serviceData, data));
        },
        sendRequest: function(name, data) {
          var template  = this.createTemplate(name, data),
              request   = this.createRequest(template),
              ajax      = app.ajax('get', request);

          return ajax;
        },
        validateResponse: function(response, state) {
          var message   = '',
              valid     = false,
              $fault,
              $response;

          if (response && state === 'success' && ($response = this.app.$(response))) {
            $fault  = $response.find('fault');
            if ($fault.length > 0) {
              message = $fault.find('name:contains("faultString")').next().text();
            } else {
              valid = true;
            }
          }

          return {
            $response : $response,
            message   : message,
            valid     : valid
          };
        },
      };
    },

    createContactService: function() {
      var self    = this,
          service = this.createService();

      return _.extend(service, {
        name: 'ContactService',
        data: [],
        findByEmail: function(email) {
          var response = this.sendRequest('contactService.findByEmail', {
            email:  email,
            fields: API_CONTACT_DETAIL_FIELDS
          });

          return response;
        },
        parseContacts: function() {

          var validate = this.validateResponse.apply(this, arguments),
              contacts = [],
              $nodes;

          if (validate.valid && validate.$response && ($nodes = validate.$response.find('struct'))) {
            contacts = $nodes.get().map(function(node) {
              var contact = {};
              _.each(API_CONTACT_DETAIL_FIELDS, function(field) {
                contact[field] = this.$(node).find('name:contains("' + field + '")').next().text(); // NOTE: Should we camelCase this keys?
              });

              return contact;
            }.bind(this));
          }
          return contacts;
        }
        // parseResponse: function() {
          
          // this.validateResponse.call(arguments);
          // service.parseResponse.call(arguments);
          // var $contacts, $fault, $faultString, $response;
          // if (response && state === 'success' && ($response = this.$(response))) {

          //   // Check for faults
          //   $fault = $response.find('fault');
          //   if ($fault.length > 0) {
          //     $faultString = $fault.find('name:contains("faultString")').next();
          //     return this.gotoMessage($faultString.text());
          //   }

          //   // Otherwise attempt to load contacts
          //   var contacts = this.parseContacts($response, API_CONTACT_DETAIL_FIELDS);
          //   this.gotoContacts(contacts);
          // } else {
          //   this.gotoMessage('Could not load data...');
          // }
        // }
      });
    },

    createDataService: function() {
      var self    = this,
          service = this.createService();

      return _.extend(service, {
        name: 'DataService',
        load: function(tableName, recordId, fields) {
          var response = this.sendRequest('dataService.load', {
            fields    : fields,
            recordId  : recordId,
            tableName : tableName
          });

          return response;
        },
        query: function(table, limit, page, queryData, selectedFields) {
          //self.renderTemplate();
        },
        parseResponse: function(response, state) {

        }
      });
    },

    // Events
    // onSearch: function() {
    //   var query = this.$().find('.search-input').val();
    //   this.getContacts(query);
    // },

    // Methods
    // getContactById: function(id) {
    //   return this.ajax('get', this.getRequestXml('ContactService.load', id, API_CONTACT_NAME_FIELDS));
    // },

    // getContactTags: function() {
    //   console.log(2121);
    // },

    getContacts: function(query) {
      // Show the loading screen
      this.gotoLoading();

      var request;
      if (_.isEmpty(query)) {
        this.gotoMessage('Not a valid search');
      } else if (this.isEmail(query)) {
        request = this.contactService.findByEmail(query);
      }

      request.done(function(response, state) {
        contacts = this.contactService.parseContacts(response, state);
        this.gotoContacts(contacts);
      }.bind(this));

      // return this.getContactsByName(query);
    },

    // getContactsByEmail: function(email) {
    //   return this.ajax('get', this.getRequestXml('ContactService.findByEmail', email, API_CONTACT_DETAIL_FIELDS));
    // },

    // getContactsByName: function(name) {
    //   throw new Exception();
    //   //return this.ajax('get', this.getRequestXml('SearchService.quickSearch', name));
    // },

    // getData: function(table, id, fields) {
    //   return this.ajax('get', this.getRequestXml('DataService.load'));
    // },

    // getRequest: function(data) {
    //   return {
    //     contentType : 'application/xml',
    //     data        : data,
    //     dataType    : 'xml',
    //     proxy_v2    : true,
    //     type        : 'POST',
    //     url         : API_URL.fmt(this.settings.subdomain)
    //   };
    // },

    // getRequestXml: function(serviceName, query, select) {
    //   var templateData = {
    //     name    : serviceName,
    //     query   : query,
    //     select  : select.sort(),
    //     token   : this.settings.token
    //   };
    //   return this.renderTemplate('request', templateData);
    // },

    gotoContacts: function(contacts) {
      var templateData = {
        contacts  : contacts,
        matches   : contacts.length,
        subdomain : this.settings.subdomain
      };

      if (contacts.length > 0) {
        this.switchTo('contacts', templateData);

        // Get partials
        var $view           = this.$(),
            $orders         = this.renderTemplate('orders'),
            $subscriptions  = this.renderTemplate('orders'),
            $tags           = this.renderTemplate('tags');

        // Inject
        $view.find('.orders').append($orders);
        $view.find('.subscriptions').append($subscriptions);
        $view.find('.tags .content').append($tags);

        return;
      }

      this.gotoMessage('We\'re sorry but it appears we were unable to match this end-user with an Infusionsoft contact. You can try searching instead', 'Contact not found');
    },

    // gotoIndex: function() {
    //   this.switchTo('orders');
    // },

    gotoLoading: function() {
      this.gotoMessage('Please wait. Loading data...','Loading');
    },

    gotoMessage: function(message, title) {
      this.switchTo('message', {
        message : message || this.I18n.t('message.default.message'),
        title   : title   || this.I18n.t('message.default.title')
      });
    },

    // gotoSearch: function() {
    //   this.switchTo('search', {
    //     query: 'something'
    //   });
    // },

    isEmail: function(value) {
      return true;
    },

    // loadContactResults: function(response, state) {
    //   var $contacts, $fault, $faultString, $response;
    //   if (response && state === 'success' && ($response = this.$(response))) {

    //     // Check for faults
    //     $fault = $response.find('fault');
    //     if ($fault.length > 0) {
    //       $faultString = $fault.find('name:contains("faultString")').next();
    //       return this.gotoMessage($faultString.text());
    //     }

    //     // Otherwise attempt to load contacts
    //     var contacts = this.parseContacts($response, API_CONTACT_DETAIL_FIELDS);
    //     this.gotoContacts(contacts);
    //   } else {
    //     this.gotoMessage('Could not load data...');
    //   }
    // },



    // parseContactsOrders: function() {

    // },

    // parseContactsTags: function() {

    // },

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
