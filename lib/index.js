'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.forceCheck = exports.lazyload = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactDom = require('react-dom');

var _reactDom2 = _interopRequireDefault(_reactDom);

var _propTypes = require('prop-types');

var _propTypes2 = _interopRequireDefault(_propTypes);

var _event = require('./utils/event');

var _scrollParent = require('./utils/scrollParent');

var _scrollParent2 = _interopRequireDefault(_scrollParent);

var _debounce = require('./utils/debounce');

var _debounce2 = _interopRequireDefault(_debounce);

var _throttle = require('./utils/throttle');

var _throttle2 = _interopRequireDefault(_throttle);

var _decorator = require('./decorator');

var _decorator2 = _interopRequireDefault(_decorator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * react-lazyload
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                */


var defaultBoundingClientRect = { top: 0, height: 0 };
var LISTEN_FLAG = 'data-lazyload-listened';
var listeners = [];
var pending = [];
var currentScrollTop = window.scrollY;
var windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
var containerList = [];

var getOffsetTop = function getOffsetTop(node, parent) {
  if (node.offsetParent === parent || node.offsetParent === null) {
    return node.offsetTop || 0;
  }
  return node.offsetTop + getOffsetTop(node.offsetParent, parent);
};

var getNodeRect = function getNodeRect(node, parent) {
  return {
    height: node.clientHeight,
    top: getOffsetTop(node, parent || document.getRootNode())
  };
};

/**
 * Check if `component` is visible in overflow container `parent`
 * @param  {node} component React component
 * @param  {node} parent    component's scroll parent
 * @return {bool}
 */
var checkOverflowVisible = function checkOverflowVisible(component, container) {
  var parentHeight = container.rect.height;

  // check whether the element is visible in the intersection

  var _component$clientRect = component.clientRect,
      top = _component$clientRect.top,
      height = _component$clientRect.height;


  var offsets = Array.isArray(component.props.offset) ? component.props.offset : [component.props.offset, component.props.offset]; // Be compatible with previous API
  return top - offsets[0] <= parentHeight + container.scrollTop && top + height + offsets[1] >= container.scrollTop;
};

var resetComponentVisible = function resetComponentVisible(visible, component) {
  if (visible) {
    // Avoid extra render if previously is visible
    if (!component.visible) {
      if (component.props.once) {
        pending.push(component);
      }

      component.visible = true;
      component.forceUpdate();
    }
  } else if (!(component.props.once && component.visible)) {
    component.visible = false;
    if (component.props.unmountIfInvisible) {
      component.forceUpdate();
    }
  }
};

var getContainer = function getContainer(parent) {
  var container = containerList.find(function (item) {
    return item.parent === parent;
  });
  if (container) {
    return container;
  }
  var newContainer = {
    parent: parent,
    scrollTop: 0
  };
  containerList.push(newContainer);
  return newContainer;
};

var pushToContainer = function pushToContainer(component, parent) {
  var container = getContainer(parent);
  container.components = container.components || [];
  var index = container.components.findIndex(function (item) {
    return item === component;
  });
  if (index >= 0) {
    container.components[index] = component;
  } else {
    container.components.push(component);
  }
  var visible = checkOverflowVisible(component, container);
  resetComponentVisible(visible, component);
};

var checkContainers = function checkContainers() {
  containerList.forEach(function (container) {
    var node = container.parent;
    container.scrollTop = node.scrollTop;
    var top = 0;
    var height = 0;
    try {
      var _node$getBoundingClie = node.getBoundingClientRect();

      top = _node$getBoundingClie.top;
      height = _node$getBoundingClie.height;
    } catch (e) {
      top = defaultBoundingClientRect.top;
      height = defaultBoundingClientRect.height;
    }
    var offsets = [100, 100];
    container.visible = top - offsets[0] <= windowInnerHeight && top + height + offsets[1] >= 0;
    if (!container.visible) {
      container.components.forEach(function (component) {
        return resetComponentVisible(false, component);
      });
    } else {
      container.components.forEach(function (component) {
        var visible = checkOverflowVisible(component, container);
        resetComponentVisible(visible, component);
      });
    }
  });
};

var setContainerNodeRect = function setContainerNodeRect(parent) {
  var container = getContainer(parent);
  container.rect = getNodeRect(parent);
};

// try to handle passive events
var passiveEventSupported = false;
try {
  var opts = Object.defineProperty({}, 'passive', {
    get: function get() {
      passiveEventSupported = true;
    }
  });
  window.addEventListener('test', null, opts);
} catch (e) {}
// if they are supported, setup the optional params
// IMPORTANT: FALSE doubles as the default CAPTURE value!
var passiveEvent = passiveEventSupported ? { capture: false, passive: true } : false;

/**
 * Check if `component` is visible in document
 * @param  {node} component React component
 * @return {bool}
 */
var checkNormalVisible = function checkNormalVisible(component) {
  // If this element is hidden by css rules somehow, it's definitely invisible
  if (component.skip) return false;

  var _component$clientRect2 = component.clientRect,
      top = _component$clientRect2.top,
      elementHeight = _component$clientRect2.height;


  var offsets = Array.isArray(component.props.offset) ? component.props.offset : [component.props.offset, component.props.offset]; // Be compatible with previous API
  console.log(top, offsets, elementHeight, currentScrollTop, windowInnerHeight, top - offsets[0] <= currentScrollTop + windowInnerHeight, top + elementHeight + offsets[1] >= currentScrollTop);
  return top - offsets[0] <= currentScrollTop + windowInnerHeight && top + elementHeight + offsets[1] >= currentScrollTop;
};

/**
 * Detect if element is visible in viewport, if so, set `visible` state to true.
 * If `once` prop is provided true, remove component as listener after checkVisible
 *
 * @param  {React} component   React component that respond to scroll and resize
 */
var checkVisible = function checkVisible(component) {
  var visible = checkNormalVisible(component);
  resetComponentVisible(visible, component);
};

var purgePending = function purgePending() {
  pending.forEach(function (component) {
    var index = listeners.indexOf(component);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  });

  pending = [];
};
var lazyLoadHandler = function lazyLoadHandler() {
  currentScrollTop = window.scrollY;
  windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
  checkContainers();
  for (var i = 0; i < listeners.length; ++i) {
    var listener = listeners[i];
    checkVisible(listener);
  }
  // Remove `once` component in listeners
  purgePending();
};

// Depending on component's props
var delayType = void 0;
var finalLazyLoadHandler = null;

var isString = function isString(string) {
  return typeof string === 'string';
};

var LazyLoad = function (_Component) {
  _inherits(LazyLoad, _Component);

  function LazyLoad(props) {
    _classCallCheck(this, LazyLoad);

    var _this = _possibleConstructorReturn(this, (LazyLoad.__proto__ || Object.getPrototypeOf(LazyLoad)).call(this, props));

    _this.visible = false;
    return _this;
  }

  _createClass(LazyLoad, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      // It's unlikely to change delay type on the fly, this is mainly
      // designed for tests
      var scrollport = window;
      currentScrollTop = window.scrollY;
      windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
      var scrollContainer = this.props.scrollContainer;

      if (scrollContainer) {
        if (isString(scrollContainer)) {
          scrollport = scrollport.document.querySelector(scrollContainer);
        }
      }
      var needResetFinalLazyLoadHandler = this.props.debounce !== undefined && delayType === 'throttle' || delayType === 'debounce' && this.props.debounce === undefined;

      if (needResetFinalLazyLoadHandler) {
        (0, _event.off)(scrollport, 'scroll', finalLazyLoadHandler, passiveEvent);
        (0, _event.off)(window, 'resize', finalLazyLoadHandler, passiveEvent);
        finalLazyLoadHandler = null;
      }

      if (!finalLazyLoadHandler) {
        if (this.props.debounce !== undefined) {
          finalLazyLoadHandler = (0, _debounce2.default)(lazyLoadHandler, typeof this.props.debounce === 'number' ? this.props.debounce : 300);
          delayType = 'debounce';
        } else if (this.props.throttle !== undefined) {
          finalLazyLoadHandler = (0, _throttle2.default)(lazyLoadHandler, typeof this.props.throttle === 'number' ? this.props.throttle : 300);
          delayType = 'throttle';
        } else {
          finalLazyLoadHandler = lazyLoadHandler;
        }
      }
      var node = _reactDom2.default.findDOMNode(this);
      if (!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)) this.skip = true;

      if (this.props.overflow) {
        var parent = (0, _scrollParent2.default)(node);
        try {
          this.clientRect = getNodeRect(node, parent);
        } catch (e) {
          this.clientRect = defaultBoundingClientRect;
        }
        if (parent && typeof parent.getAttribute === 'function') {
          var listenerCount = 1 + +parent.getAttribute(LISTEN_FLAG);
          if (listenerCount === 1) {
            setContainerNodeRect(parent);
            parent.addEventListener('scroll', finalLazyLoadHandler, passiveEvent);
          }
          parent.setAttribute(LISTEN_FLAG, listenerCount);
          pushToContainer(this, parent);
        }
      } else {
        try {
          this.clientRect = getNodeRect(node, null);
        } catch (e) {
          this.clientRect = defaultBoundingClientRect;
        }
        if (listeners.length === 0 || needResetFinalLazyLoadHandler) {
          var _props = this.props,
              scroll = _props.scroll,
              resize = _props.resize;


          if (scroll) {
            (0, _event.on)(scrollport, 'scroll', finalLazyLoadHandler, passiveEvent);
          }

          if (resize) {
            (0, _event.on)(window, 'resize', finalLazyLoadHandler, passiveEvent);
          }
        }
        listeners.push(this);
        checkVisible(this);
      }
    }
  }, {
    key: 'shouldComponentUpdate',
    value: function shouldComponentUpdate() {
      return this.visible;
    }
  }, {
    key: 'componentWillUnmount',
    value: function componentWillUnmount() {
      var _this2 = this;

      if (this.props.overflow) {
        var parent = (0, _scrollParent2.default)(_reactDom2.default.findDOMNode(this));
        if (parent && typeof parent.getAttribute === 'function') {
          var listenerCount = +parent.getAttribute(LISTEN_FLAG) - 1;
          var container = getContainer(parent);
          if (container) {
            container.components.splice(container.components.findIndex(function (item) {
              return item === _this2;
            }), 1);
            if (listenerCount === 0) {
              parent.removeEventListener('scroll', finalLazyLoadHandler, passiveEvent);
              parent.removeAttribute(LISTEN_FLAG);
              containerList.splice(containerList.findIndex(function (item) {
                return item.parent === parent;
              }), 1);
            } else {
              parent.setAttribute(LISTEN_FLAG, listenerCount);
            }
          }
        }
      }

      var index = listeners.indexOf(this);
      if (index !== -1) {
        listeners.splice(index, 1);
      }

      if (listeners.length === 0) {
        (0, _event.off)(window, 'resize', finalLazyLoadHandler, passiveEvent);
        (0, _event.off)(window, 'scroll', finalLazyLoadHandler, passiveEvent);
      }
    }
  }, {
    key: 'render',
    value: function render() {
      return this.visible ? this.props.children : this.props.placeholder ? this.props.placeholder : _react2.default.createElement('div', { style: { height: this.props.height }, className: 'lazyload-placeholder' });
    }
  }]);

  return LazyLoad;
}(_react.Component);

LazyLoad.propTypes = {
  once: _propTypes2.default.bool,
  height: _propTypes2.default.oneOfType([_propTypes2.default.number, _propTypes2.default.string]),
  offset: _propTypes2.default.oneOfType([_propTypes2.default.number, _propTypes2.default.arrayOf(_propTypes2.default.number)]),
  overflow: _propTypes2.default.bool,
  resize: _propTypes2.default.bool,
  scroll: _propTypes2.default.bool,
  children: _propTypes2.default.node,
  throttle: _propTypes2.default.oneOfType([_propTypes2.default.number, _propTypes2.default.bool]),
  debounce: _propTypes2.default.oneOfType([_propTypes2.default.number, _propTypes2.default.bool]),
  placeholder: _propTypes2.default.node,
  scrollContainer: _propTypes2.default.oneOfType([_propTypes2.default.string, _propTypes2.default.object]),
  unmountIfInvisible: _propTypes2.default.bool
};

LazyLoad.defaultProps = {
  once: false,
  offset: 0,
  overflow: false,
  resize: false,
  scroll: true,
  unmountIfInvisible: false
};

var lazyload = exports.lazyload = _decorator2.default;
exports.default = LazyLoad;
exports.forceCheck = lazyLoadHandler;