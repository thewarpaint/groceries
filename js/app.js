var groceriesRef;

// Thresholds should be in descending order.
// Last one should have the lowest number available to capture all other cases.

var EDIBLE = 'edible',
    ABOUT_TO_EXPIRE = 'aboutToExpire',
    EXPIRED = 'expired';

var thresholds = [
  { key: EDIBLE, delta: 3 },
  { key: ABOUT_TO_EXPIRE, delta: 0 },
  { key: EXPIRED, delta: Number.NEGATIVE_INFINITY }
];

var i18n = {
  categories: {},
  loading: 'Cargando...',
  networkStatus: {
    offline: 'La conexión a internet se ha perdido.'
  },
  products: {
    actions: {
      add: 'Agregar',
      cancel: 'Cancelar',
      delete: 'Borrar',
      edit: 'Editar',
      save: 'Guardar'
    },
    emptyState: {
      intro: 'No hay productos en esta categoría.',
      callToAction: '¿Deseas agregar uno?'
    }
  }
};

i18n.categories[EDIBLE] = 'Todo bien';
i18n.categories[ABOUT_TO_EXPIRE] = 'Con cuidado...';
i18n.categories[EXPIRED] = '¡Ya tíralo!';

var MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24;

// Save query params when loaded and update as needed.
// From http://stackoverflow.com/a/2880929
var urlParams;

(window.onpopstate = function () {
  var match,
    pl     = /\+/g,  // Regex for replacing addition symbol with a space
    search = /([^&=]+)=?([^&]*)/g,
    decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
    query  = window.location.search.substring(1);

  urlParams = {};

  while (match = search.exec(query)) {
    urlParams[decode(match[1])] = decode(match[2]);
  }
})();

var GroceriesApp = {
  init: function () {
    FirebaseLayer.init();
    PersistenceLayer.init();
    ProductForm.init();
    Datalist.init();
    CategoryList.init();
    NetworkStatus.init();

    LocalStorageLayer.loadAndRenderCache();

    // Load the Firebase script only if we're not in offline mode
    if (!PersistenceLayer.offlineMode) {
      FirebaseLayer.loadScript();
    }
  }
};

var PersistenceLayer = {
  offlineMode: true,

  data: {
    version: 1,
    products: []
  },

  init: function () {
    PersistenceLayer.offlineMode = !FirebaseLayer.account;

    // Save a copy of the current state when the page is unloaded if we're not in offline mode
    if (!PersistenceLayer.offlineMode) {
      window.addEventListener('unload', function (event) {
        LocalStorageLayer.set('groceries', PersistenceLayer.serialize(PersistenceLayer.data));
      });
    }
  },

  save: function (data) {
    var serializedData = PersistenceLayer.serialize(data);

    if (PersistenceLayer.offlineMode) {
      LocalStorageLayer.set('groceries', serializedData);
      CategoryList.view.render(PersistenceLayer.data);
    } else {
      groceriesRef.set(serializedData);
    }
  },

  update: function (data) {
    PersistenceLayer.data = PersistenceLayer.unserialize(data);
  },

  serialize: function (data) {
    return {
      version: data.version,
      products: data.products.map(function (product) {
        return {
          uuid: product.uuid,
          label: product.label,
          expirationDate: dateService.getFormattedDate(product.expirationDate)
        };
      })
    };
  },

  unserialize: function (data) {
    var model = {
      version: data.version,
      products: []
    };

    if (data.products && data.products.length > 0) {
      model.products = data.products.map(function (product) {
        return {
          uuid: product.uuid,
          label: product.label,
          expirationDate: dateService.getDateFromString(product.expirationDate)
        };
      });
    }

    return model;
  }
};

var FirebaseLayer = {
  account: null,
  scriptUrl: '//www.gstatic.com/firebasejs/3.7.1/firebase.js',

  init: function () {
    var account = urlParams.account;

    if (account) {
      // Account is defined in the URL, save in localStorage for the next time.
      FirebaseLayer.setAccount(account);

      model = LocalStorageLayer.get('groceriesData', {});
      model.account = account;
      LocalStorageLayer.set('groceriesData', model);
    } else {
      // Try to get account from localStorage.
      model = LocalStorageLayer.get('groceriesData');

      if (model) {
        FirebaseLayer.setAccount(model.account);
      }
    }
  },

  loadScript: function () {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.defer = true;
    script.addEventListener('load', FirebaseLayer.onLoad);
    script.src = FirebaseLayer.scriptUrl;

    document.getElementsByTagName('head')[0].appendChild(script);
  },

  onLoad: function () {
    var config = {
      apiKey: 'AIzaSyAWlwVDJmSi0TT4f5gfD1bQD62yJDIeEYg',
      authDomain: 'groceries-6911d.firebaseapp.com',
      databaseURL: 'https://groceries-6911d.firebaseio.com',
      storageBucket: 'groceries-6911d.appspot.com',
      messagingSenderId: '849879024713'
    };

    firebase.initializeApp(config);

    groceriesRef = firebase.database().ref('groceries/' + FirebaseLayer.account);

    // TODO: Figure out how to send and receive more granular updates, not the whole list at once.
    groceriesRef.on('value', function (snapshot) {
      PersistenceLayer.update(snapshot.val());
      CategoryList.view.render(PersistenceLayer.data);
      Datalist.addCurrentProductsToDatalist();
    });
  },

  setAccount: function (account) {
    FirebaseLayer.account = account;
  }
};

var LocalStorageLayer = {
  get: function (key, defaultValue) {
    try {
      var value = JSON.parse(localStorage.getItem(key));

      if (value === null && typeof defaultValue !== 'undefined') {
        return defaultValue;
      }

      return value;
    } catch (e) {
      console.error('Couldn\'t get localStorage key:', key, e);

      if (typeof defaultValue !== 'undefined') {
        return defaultValue;
      }

      return null;
    }
  },

  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Couldn\'t set localStorage key:', key, ', value:', value, e);
    }
  },

  loadAndRenderCache: function () {
    // Start by loading (and rendering) the localStorage model
    var model = LocalStorageLayer.get('groceries');

    if (model) {
      model = PersistenceLayer.unserialize(model);

      // Disable the product actions if not in offline mode since we're still waiting to load Firebase
      if (!PersistenceLayer.offlineMode) {
        model.products = model.products.map(function (product) {
          product._actionsDisabled = true;

          return product;
        });
      }

      CategoryList.view.render(model);
    }
  }
};

var ProductForm = {
  elements: {
    add: null,
    cancel: null,
    expirationDate: null,
    form: null,
    label: null,
    uuid: null,
    save: null
  },

  init: function () {
    ProductForm.elements.form = document.getElementById('product-form');

    ProductForm.elements.expirationDate = document.getElementById('product-expiration-date-field');
    ProductForm.elements.label = document.getElementById('product-label-field');
    ProductForm.elements.uuid = document.getElementById('product-uuid-field');

    ProductForm.elements.add = document.getElementById('product-add-button');
    ProductForm.elements.cancel = document.getElementById('product-cancel-button');
    ProductForm.elements.save = document.getElementById('product-save-button');
    ProductForm.elements.datePlus = document.getElementById('product-date-plus-button');
    ProductForm.elements.dateMinus = document.getElementById('product-date-minus-button');

    ProductForm.elements.add.textContent = i18n.products.actions.add;
    ProductForm.elements.cancel.textContent = i18n.products.actions.cancel;
    ProductForm.elements.save.textContent = i18n.products.actions.save;

    ProductForm.reset();
  },

  onSubmit: function (event) {
    var product = ProductForm.getData();

    if (product.uuid) {
      ProductList.update(product);
      ProductForm.setEditMode(false);
    } else {
      product.uuid = uuidService.getNewUuid();
      ProductList.add(product);
    }

    ProductForm.reset();
    event.preventDefault();
  },

  edit: function (product) {
    var data = {
      editMode: true,
      expirationDate: product.expirationDate,
      label: product.label,
      minExpirationDate: null,
      uuid: product.uuid
    };

    ProductForm.setData(data);
    ProductForm.focus();
  },

  reset: function () {
    var now = new Date();
    var threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Minimum expiration date is today, no expirations in the past.
    // Default expiration date is three days from now.
    var data = {
      editMode: false,
      expirationDate: threeDaysFromNow,
      label: '',
      minExpirationDate: now,
      uuid: ''
    };

    ProductForm.setData(data);
  },

  getData: function () {
    return {
      editMode: ProductForm.elements.form.classList.contains('product-form--edit'),
      expirationDate: dateService.getDateFromString(ProductForm.elements.expirationDate.value),
      label: ProductForm.elements.label.value,
      minExpirationDate: dateService.getDateFromString(ProductForm.elements.expirationDate.min),
      uuid: ProductForm.elements.uuid.value
    }
  },

  setData: function (data) {
    ProductForm.elements.expirationDate.value = dateService.getFormattedDate(data.expirationDate);
    ProductForm.elements.label.value = data.label;
    ProductForm.elements.uuid.value = data.uuid;

    if (data.minExpirationDate) {
      ProductForm.elements.expirationDate.min = dateService.getFormattedDate(data.minExpirationDate);
      ProductForm.elements.dateMinus.disabled =
        data.expirationDate.getTime() === data.minExpirationDate.getTime();
    } else {
      ProductForm.elements.expirationDate.min = '';
      ProductForm.elements.dateMinus.disabled = false;
    }

    ProductForm.setEditMode(data.editMode);
  },

  focus: function () {
    ProductForm.elements.label.focus();
  },

  setEditMode: function (editMode) {
    if (editMode) {
      ProductForm.elements.form.classList.add('product-form--edit');
      ProductForm.elements.form.classList.remove('product-form--add');
    } else {
      ProductForm.elements.form.classList.add('product-form--add');
      ProductForm.elements.form.classList.remove('product-form--edit');
    }
  },

  changeDay: function (delta) {
    var data = ProductForm.getData();
    var newExpirationDate = new Date(data.expirationDate.getTime());

    newExpirationDate.setDate(data.expirationDate.getDate() + delta);

    if (!data.minExpirationDate || newExpirationDate >= data.minExpirationDate) {
      data.expirationDate = newExpirationDate;
    }

    ProductForm.setData(data);
  }
};

var ProductList = {
  view: {
    getHTML: function (products) {
      if (products.length === 0) {
        return i18n.products.emptyState.intro + ' <a href="#" class="link" onclick="ProductForm.focus()">' +
          i18n.products.emptyState.callToAction + '</a>';
      }

      return '<ul class="product-list">' + ProductList.view.getInnerHTML(products) + '</ul>';
    },

    getInnerHTML: function (products) {
      return products
        .sort(function (a, b) {
          return a.expirationDate.getTime() - b.expirationDate.getTime();
        })
        .map(function (product) {
          return productRenderer.getProductViewHTML(product);
        })
        .join('');
    },

    // Deprecated?
    render: function (products) {
      document.getElementById('product-list').innerHTML = ProductList.view.getInnerHTML(products);
    }
  },

  add: function (product) {
    // TODO: Figure out how to render just new products (either local ones or from Firebase),
    // not the whole list all the time.
    // productRenderer.addProduct(product);
    PersistenceLayer.data.products.push(product);
    PersistenceLayer.save(PersistenceLayer.data);
    Datalist.add(product);
  },

  edit: function (productUuid) {
    var product = ProductList.findByUuid(productUuid);

    if (typeof product !== 'undefined') {
      ProductForm.edit(product);
    }
  },

  update: function (newProduct) {
    var productIndex = ProductList.findIndexByUuid(newProduct.uuid);

    if (typeof productIndex === -1) {
      console.error('Unable to update product', newProduct);
    }

    PersistenceLayer.data.products[productIndex] = newProduct;
    PersistenceLayer.save(PersistenceLayer.data);
    Datalist.add(newProduct);
  },

  remove: function (productUuid) {
    if(confirm('¿Estás seguro?')) {
      ProductList.doRemove(productUuid);
    }
  },

  doRemove: function (productUuid) {
    var index = null;

    for (var i = 0; i < PersistenceLayer.data.products.length; i++) {
      if (PersistenceLayer.data.products[i].uuid === productUuid) {
        index = i;
        break;
      }
    }

    if (index !== null) {
      PersistenceLayer.data.products.splice(index, 1);
      PersistenceLayer.save(PersistenceLayer.data);
    }
  },

  findByUuid: function (uuid) {
    return PersistenceLayer.data.products.find(function (product) {
      return product.uuid === uuid;
    })
  },

  findIndexByUuid: function (uuid) {
    return PersistenceLayer.data.products.findIndex(function (product) {
      return product.uuid === uuid;
    })
  }
};

var productRenderer = {
  addProduct: function (product) {
    document.getElementById('product-list').innerHTML += productRenderer.getProductViewHTML(product);
  },

  getProductViewHTML: function (product) {
    return '<li id="product-' + product.uuid + '" class="product">' +
        productRenderer.getProductViewInnerHTML(product) + '</li>';
  },

  getProductViewInnerHTML: function (product) {
    var dateDelta = Math.ceil(dateService.getDelta(new Date(), product.expirationDate));
    var formattedDate = dateService.getHumanReadableDate(product.expirationDate);
    var html;

    html = '<h3 class="product__header">' + product.label + '</h3>';

    if (dateDelta === 0) {
      html += '<p>Caduca hoy.</p>';
    } else {
      if (dateDelta > 0) {
        html += '<p>Caduca en ' + dateDelta + ' día' + (dateDelta === 1 ? '' : 's');
      } else {
        dateDeltaAbsValue = Math.abs(dateDelta);
        html += '<p>Caducó hace ' + dateDeltaAbsValue + ' día' + (dateDeltaAbsValue === 1 ? '' : 's');
      }

      html += ', el ' + formattedDate + '.</p>';
    }

    html += '<div class="product__actions">' +
              '<button ' +
                'class="product__action" ' +
                'onclick="ProductList.edit(\'' + product.uuid + '\')"' +
                (product._actionsDisabled ? 'disabled' : '') +
                '>' + i18n.products.actions.edit + '</button>' +
              '<button ' +
                'class="product__action"' +
                'onclick="ProductList.remove(\'' + product.uuid + '\')"' +
                (product._actionsDisabled ? 'disabled' : '') +
                '>' + i18n.products.actions.delete + '</button>' +
            '</div>';

    return html;
  }
};

var dateService = {
  months: [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ],
  getDelta: function (a, b) {
    return (b.getTime() - a.getTime()) / MILLISECONDS_IN_DAY;
  },
  getDayDeltaForTimestamps: function (timestampA, timestampB) {
    return (timestampB - timestampA) / MILLISECONDS_IN_DAY;
  },
  getHumanReadableDate: function (date) {
    return date.getDate() + ' de ' + dateService.months[date.getMonth()];
  },
  getFormattedDate: function (date) {
    var year = date.getFullYear(),
        month = date.getMonth() + 1,
        day = date.getDate();

    return year + '-' +
           (month < 10 ? '0' + month : month) + '-' +
           (day < 10 ? '0' + day : day);
  },

  getDateFromString: function (dateString) {
    if (!dateString) {
      return null;
    }

    var dateParts = dateString.split('-').map(function (s) {
      return parseInt(s, 10);
    });

    return new Date(dateParts[0], dateParts[1] - 1, dateParts [2]);
  },

  setDateToBeginningOfDay: function (date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date;
  }
};

var uuidService = {
  getNewUuid: function () {
    /**
     * Note: Not really a valid UUID/GUID, just a random placeholder for now.
     * From http://stackoverflow.com/a/105074
     */ 
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }


    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  }
};

var CategoryList = {
  elements: {
    list: null,
  },

  init: function () {
    CategoryList.elements.list = document.getElementById('category-list');

    CategoryList.elements.list.textContent = i18n.loading;
  },

  view: {
    render: function (model) {
      CategoryList.elements.list.innerHTML =
        CategoryList.view.getHTML(CategoryList.groupProductsByExpirationDate(model.products));
    },

    getHTML: function (categories) {
      return categories.map(function (category) {
          return '<div class="category">' +
                    '<h2 class="category__header">' + category.label + '</h2>' +
                    ProductList.view.getHTML(category.products) +
                  '</div>';
        })
        .join('');
    }
  },

  groupProductsByExpirationDate: function (products) {
    var productsByCategory = [];
    var productsByCategoryMap = {};

    thresholds.forEach(function (threshold) {
      var category = {
        label: i18n.categories[threshold.key],
        products: []
      };

      productsByCategory.push(category);

      // Auxiliary map to categorize products
      productsByCategoryMap[threshold.key] = category.products;
    });

    var delta, i;
    var nowTimestamp = dateService.setDateToBeginningOfDay(new Date()).getTime();

    products.forEach(function (product) {
      delta = dateService.getDayDeltaForTimestamps(nowTimestamp, product.expirationDate.getTime());

      for (i = 0; i < thresholds.length; i++) {
        if (delta >= thresholds[i].delta) {
          productsByCategoryMap[thresholds[i].key].push(product);
          break;
        }
      }
    });

    return productsByCategory.reverse();
  }
};

var Datalist = {
  MAX_PAST_PRODUCTS: 100,

  view: {
    render: function (products) {
      document.getElementById('product-autocomplete').innerHTML =
        Datalist.view.getInnerHTML(products.sort());
    },

    getHTML: function (products) {
      return '<datalist id="product-autocomplete">' +
          Datalist.view.getInnerHTML(products) +
        '</datalist>';
    },

    getInnerHTML: function (products) {
      return products.map(function (productLabel) {
          return '<option value="' + productLabel + '"></option>';
        }).join('');
    },
  },

  init: function () {
    var model = LocalStorageLayer.get('groceriesData', {});

    if (model.pastProducts) {
      Datalist.view.render(model.pastProducts);
    }
  },

  add: function (product) {
    var model = LocalStorageLayer.get('groceriesData', { pastProducts: [] });

    if (model.pastProducts.indexOf(product.label) === -1) {
      model.pastProducts.unshift(product.label);

      if (model.pastProducts.length > Datalist.MAX_PAST_PRODUCTS) {
        model.pastProducts.pop();
      }

      LocalStorageLayer.set('groceriesData', model);
      Datalist.view.render(model.pastProducts);
    }
  },

  addCurrentProductsToDatalist: function () {
    model = LocalStorageLayer.get('groceriesData', {});

    if (typeof model.pastProducts === 'undefined') {
      model.pastProducts = PersistenceLayer.data.products.map(function (product) {
        return product.label;
      });

      LocalStorageLayer.set('groceriesData', model);
      Datalist.view.render(model.pastProducts);
    }
  }
};

var NetworkStatus = {
  elements: {
    networkStatus: null
  },

  init: function () {
    NetworkStatus.elements.networkStatus = document.getElementById('network-status');

    NetworkStatus.elements.networkStatus.textContent = i18n.networkStatus.offline;

    window.addEventListener('online', NetworkStatus.updateStatus);
    window.addEventListener('offline', NetworkStatus.updateStatus);
  },

  updateStatus: function () {
    NetworkStatus.elements.networkStatus.classList.toggle('network-status--offline', !navigator.onLine);
  }
};

document.addEventListener('DOMContentLoaded', GroceriesApp.init);