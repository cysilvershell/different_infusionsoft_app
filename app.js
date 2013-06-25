/*globals */
(function() {

  // Constants
  var API_CONTACT_NAME_FIELDS    = [ 'FirstName', 'LastName' ],
      API_CONTACT_DETAIL_FIELDS  = API_CONTACT_NAME_FIELDS.concat([ 'Company', 'DateCreated', 'Email', 'Id', 'JobTitle', 'Leadsource', 'OwnerID', 'Phone1' ]),
      API_URL                    = 'https://%@.infusionsoft.com/api/xmlrpc',
      EMAIL_REGEX                = '';

  return {
    defaultState: 'loading',
    events: {
      'app.activated'             : 'init',
      'click .search-button'      : 'onSearch',
      'click .contact h5'         : 'toggleContactSection',
      'getContacts.always'        : 'loadContactResults', // 200 returned on API error
      // 'keypress .search-input'    : 'onSearch'
    },
    requests: {
      'getContacts'               : function(request) { return this.getRequest(request); },
    },

    // Initialization
    init: function(data) {
      if (!data.firstLoad) {
        return;
      }

      // Perform default search-input
      this.getContacts('kiran@zendesk.com');//this.ticket().requester().email());
    },

    // Events
    onSearch: function(e) {
      var $input = this.$().find('.search-input'),
          query  = $input.val();

      if (!_.isEmpty(query)) {
        this.switchTo('loading');
        this.getContacts(query); 
      }
    },

    // Methods
    getContacts: function(query) {
      if (this.isEmail(query)) {
        return this.getContactsByEmail(query);
      }
      return this.getContactsByName(query);
    },

    getContactById: function(id) {
      return this.ajax('getContacts', this.getRequestXml('ContactService.load', id, API_CONTACT_NAME_FIELDS));
    },

    getContactsByEmail: function(email) {
      return this.ajax('getContacts', this.getRequestXml('ContactService.findByEmail', email, API_CONTACT_DETAIL_FIELDS));
    },

    getContactsByName: function(name) {
      return this.ajax('getContacts', this.getRequestXml('SearchService.quickSearch', name));
    },

    getRequest: function(data) {
      return {
        contentType : 'application/xml',
        data        : data,
        dataType    : 'xml',
        proxy_v2    : true,
        type        : 'POST',
        url         : API_URL.fmt(this.settings.subdomain)
      };
    },

    getRequestXml: function(serviceName, query, select) {
      var templateData = {
        name    : serviceName,
        query   : query,
        select  : select,
        token   : this.settings.token
      };
      return this.renderTemplate('request', templateData);
    },

    gotoContacts: function(contacts) {
      var templateData = {
        contacts  : contacts,
        matches   : contacts.length,
        subdomain : this.settings.subdomain
      };
      this.switchTo('contacts', templateData);
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

        // Check for faults
        $fault = $response.find('fault');
        if ($fault.length > 0) {
          $faultString = $fault.find('name:contains("faultString")').next();
          return this.gotoError($faultString.text());
        }

        // Otherwise attempt to load contacts
        var contacts = this.parseContacts($response);
        this.gotoContacts(contacts);
      } else {
        this.gotoError('SOMETHING WENT WRONG!!');
      }
    },

    parseContacts: function($response, fields) {
      var contacts = [],
          $nodes;

      if ($response && ($nodes = $response.find('struct'))) {
        fields   = fields || API_CONTACT_DETAIL_FIELDS,
        contacts = $nodes.get().map(function(node) {
          var contact = {};
          _.each(fields, function(field) {
            contact[field] = this.$(node).find('name:contains("' + field + '")').next().text(); // NOTE: Should we camelCase this keys?
          });

          // Get the contact owner
          
          return contact;
        }.bind(this));
      }
      return contacts;
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
