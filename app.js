/*globals */
(function() {

  // Constants
  var API_CONTACT_FIELDS  = [ 'Id', 'FirstName', 'LastName' ],
      API_URL             = 'https://%@.infusionsoft.com/api/xmlrpc',
      EMAIL_REGEX         = '';

  // Models
  var Contact = function() {
  };

  Contact.prototype.fullName = function() {
    return '%@ %@'.fmt(this.firstName, this.lastName);
  };

  Contact.prototype.parse = function() {

  };

  return {
    defaultState: 'loading',
    events: {
      'app.activated'             : 'init',
      'click .search-button'      : 'onSearch',
      'getContactsByEmail.done'   : 'loadContactResults', // 200 returned on API error
      'getContactsByEmail.fail'   : 'loadContactResults',
      'keypress .search-input'    : 'onSearch'
    },
    requests: { // TODO: Would be better to call directly
      'getContactsByEmail'        : function(request) { return this.getRequest(request); },
      'getContactsByName'         : function(request) { return this.getRequest(request); }
    },

    // Initialization
    init: function(data) {
      if (!data.firstLoad) {
        return;
      }

      // Perform default search
      this.getContacts(this.ticket().requester().email());
    },

    // Events
    onSearch: function(e) {
      this.getContacts(this.$().find('search-input').val());
    },

    // Methods
    getContacts: function(query) {
      if (this.isEmail(query)) {
        return this.getContactsByEmail(query);
      }
      return this.getContactsByName(query);
    },

    getContactsByEmail: function(email) {
      return this.ajax('getContactsByEmail', this.getRequestXml('ContactService.findByEmail', this.settings.token, email) );
    },

    getContactsByName: function(name) {
      return this.ajax('getContactsByName', this.getRequestXml('SearchService.quickSearch', this.settings.token, name));
    },

    getRequest: function(data) {
      // debugger;
      return {
        contentType : 'application/xml',
        cors        : false,
        data        : data,
        dataType    : 'text',
        'proxy_v2'  : false ,
        type        : 'POST',
        url         : API_URL.fmt(this.settings.subdomain)
      };
    },

    getRequestXml: function(serviceName) {
      var args    = Array.prototype.slice.call(arguments, 1),
          params  = args.map(function(param) {
            return {
              type  : _.isArray(param) ? 'array': typeof(param),
              value : param
            };
          }),
          templateData = {
            name    : serviceName,
            params  : params
          };

      return this.renderTemplate('request', templateData);
    },

    gotoContacts: function() {
      var contacts = [];
      contacts.push(new Contact());
      contacts.push(new Contact());
      contacts.push(new Contact());
      this.switchTo('contacts', contacts);
    },

    gotoError: function(message, title) {
      title = title || this.I18n.t('error.default.title');
      this.switchTo('error', { message: message, title: title });
    },

    isEmail: function(value) {
      return true;
    },

    loadContactResults: function(response, state) {
      var $contacts, $fault, $faultString, $response;

      if (response && state === 'success' && ($response = this.$(response))) {

        $fault = $response.find('fault');

        // Check for faults
        if ($fault) {
          $faultString = $fault.find('name:contains("faultString")').next();
          return this.gotoError($faultString.text());
        }

        var contacts = [
          new Contact(),
          new Contact(),
          new Contact(),
          new Contact()
        ];//this.parseContacts($response.find('struct'));
        if (!_.isEmpty(contacts)) {
          this.switchTo('contacts', contacts);
        } else {
          this.gotoError('No matching contacts');
        }
      } else {
        this.showError('SOMETHING WENT WRONG!!');
      }
    },

    parseContacts: function($nodes) {
      var contacts = [];
      if ($nodes) {
        contacts = $nodes.map(function(index, node) {
          var contact = {},
            $node     = $(node);

          _.each(API_CONTACT_FIELDS, function(field) {
            contact[field] = $node.find('name:contains("' + field + '")').next();
          });

          return contact;
        });
      }
      return contacts;
    }
  };

}());
