/**
 * react-lazyload
 */
import React, { Component } from 'react';
import ReactDom from 'react-dom';
import PropTypes from 'prop-types';
import { on, off } from './utils/event';
import scrollParent from './utils/scrollParent';
import debounce from './utils/debounce';
import throttle from './utils/throttle';

import decorator from './decorator';

const defaultBoundingClientRect = { top: 0, height: 0 };
const LISTEN_FLAG = 'data-lazyload-listened';
const listeners = [];
let pending = [];
let currentScrollTop = window.scrollY;
let windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
const containerList = [];

const getOffsetTop = function (node, parent) {
  if (node.parentNode === parent) {
    return node.offsetTop || 0;
  }
  return node.offsetTop + getOffsetTop(node.parentNode, parent);
};

const getNodeRect = function (node, parent) {
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
const checkOverflowVisible = function checkOverflowVisible(component, container) {
  const { height: parentHeight } = container.rect;

  // check whether the element is visible in the intersection
  const { top, height } = component.clientRect;


  const offsets = Array.isArray(component.props.offset) ?
                component.props.offset :
                [component.props.offset, component.props.offset]; // Be compatible with previous API
  console.log(parentHeight, top, height, offsets, container.scrollTop);
  console.log((top - offsets[0] <= parentHeight + container.scrollTop), (top + height + offsets[1] >= container.scrollTop));
  return (top - offsets[0] <= parentHeight + container.scrollTop) &&
         (top + height + offsets[1] >= container.scrollTop);
};

const resetComponentVisible = (visible, component) => {
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

const getContainer = (parent) => {
  const container = containerList.find(item => item.parent === parent);
  if (container) {
    return container;
  }
  const newContainer = {
    parent,
    scrollTop: 0,
  };
  containerList.push(newContainer);
  return newContainer;
};

const pushToContainer = (component, parent) => {
  const container = getContainer(parent);
  container.components = container.components || [];
  const index = container.components.findIndex(item => item === component);
  if (index >= 0) {
    container.components[index] = component;
  } else {
    container.components.push(component);
  }
  const visible = checkOverflowVisible(component, container);
  console.log(visible);
  resetComponentVisible(visible, component);
};

const checkContainers = () => {
  containerList.forEach((container) => {
    const node = container.parent;
    container.scrollTop = node.scrollTop;
    let top = 0;
    let height = 0;
    try {
      ({ top, height } = node.getBoundingClientRect());
    } catch (e) {
      ({ top, height } = defaultBoundingClientRect);
    }
    const offsets = [100, 100];
    container.visible = (top - offsets[0] <= windowInnerHeight) &&
    (top + height + offsets[1] >= 0);
    if (!container.visible) {
      container.components.forEach(component => resetComponentVisible(false, component));
    } else {
      container.components.forEach((component) => {
        const visible = checkOverflowVisible(component, container);
        resetComponentVisible(visible, component);
      });
    }
  });
};

const setContainerNodeRect = (parent) => {
  const container = getContainer(parent);
  container.rect = getNodeRect(parent);
};

// try to handle passive events
let passiveEventSupported = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    get() {
      passiveEventSupported = true;
    }
  });
  window.addEventListener('test', null, opts);
} catch (e) { }
// if they are supported, setup the optional params
// IMPORTANT: FALSE doubles as the default CAPTURE value!
const passiveEvent = passiveEventSupported ? { capture: false, passive: true } : false;

/**
 * Check if `component` is visible in document
 * @param  {node} component React component
 * @return {bool}
 */
const checkNormalVisible = function checkNormalVisible(component) {
  // If this element is hidden by css rules somehow, it's definitely invisible
  if (component.skip) return false;

  const { top, height: elementHeight } = component.clientRect;

  const offsets = Array.isArray(component.props.offset) ?
                component.props.offset :
                [component.props.offset, component.props.offset]; // Be compatible with previous API

  return (top - offsets[0] <= currentScrollTop + windowInnerHeight) &&
         (top + elementHeight + offsets[1] >= currentScrollTop);
};


/**
 * Detect if element is visible in viewport, if so, set `visible` state to true.
 * If `once` prop is provided true, remove component as listener after checkVisible
 *
 * @param  {React} component   React component that respond to scroll and resize
 */
const checkVisible = function checkVisible(component) {
  const node = ReactDom.findDOMNode(component);
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const parent = scrollParent(node);
  const isOverflow = component.props.overflow &&
                     parent !== node.ownerDocument &&
                     parent !== document &&
                     parent !== document.documentElement;
  const visible = isOverflow ?
                  checkOverflowVisible(component, parent) :
                  checkNormalVisible(component);
  resetComponentVisible(visible, component);
};

const purgePending = function purgePending() {
  pending.forEach((component) => {
    const index = listeners.indexOf(component);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  });

  pending = [];
};
const lazyLoadHandler = () => {
  currentScrollTop = window.scrollY;
  windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
  checkContainers();
  for (let i = 0; i < listeners.length; ++i) {
    const listener = listeners[i];
    checkVisible(listener);
  }
  // Remove `once` component in listeners
  purgePending();
};

// Depending on component's props
let delayType;
let finalLazyLoadHandler = null;

const isString = string => typeof string === 'string';

class LazyLoad extends Component {
  constructor(props) {
    super(props);

    this.visible = false;
  }

  componentDidMount() {
    // It's unlikely to change delay type on the fly, this is mainly
    // designed for tests
    let scrollport = window;
    currentScrollTop = window.scrollY;
    windowInnerHeight = window.innerHeight || document.documentElement.clientHeight;
    const {
      scrollContainer,
    } = this.props;
    if (scrollContainer) {
      if (isString(scrollContainer)) {
        scrollport = scrollport.document.querySelector(scrollContainer);
      }
    }
    const needResetFinalLazyLoadHandler = (this.props.debounce !== undefined && delayType === 'throttle')
      || (delayType === 'debounce' && this.props.debounce === undefined);

    if (needResetFinalLazyLoadHandler) {
      off(scrollport, 'scroll', finalLazyLoadHandler, passiveEvent);
      off(window, 'resize', finalLazyLoadHandler, passiveEvent);
      finalLazyLoadHandler = null;
    }

    if (!finalLazyLoadHandler) {
      if (this.props.debounce !== undefined) {
        finalLazyLoadHandler = debounce(lazyLoadHandler, typeof this.props.debounce === 'number' ?
                                                         this.props.debounce :
                                                         300);
        delayType = 'debounce';
      } else if (this.props.throttle !== undefined) {
        finalLazyLoadHandler = throttle(lazyLoadHandler, typeof this.props.throttle === 'number' ?
                                                         this.props.throttle :
                                                         300);
        delayType = 'throttle';
      } else {
        finalLazyLoadHandler = lazyLoadHandler;
      }
    }
    const node = ReactDom.findDOMNode(this);
    if (!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)) this.skip = true;

    if (this.props.overflow) {
      const parent = scrollParent(node);
      try {
        this.clientRect = getNodeRect(node, parent);
      } catch (e) {
        this.clientRect = defaultBoundingClientRect;
      }
      if (parent && typeof parent.getAttribute === 'function') {
        const listenerCount = 1 + (+parent.getAttribute(LISTEN_FLAG));
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
        const { scroll, resize } = this.props;

        if (scroll) {
          on(scrollport, 'scroll', finalLazyLoadHandler, passiveEvent);
        }

        if (resize) {
          on(window, 'resize', finalLazyLoadHandler, passiveEvent);
        }
      }
      listeners.push(this);
      checkVisible(this);
    }
  }

  shouldComponentUpdate() {
    return this.visible;
  }

  componentWillUnmount() {
    if (this.props.overflow) {
      const parent = scrollParent(ReactDom.findDOMNode(this));
      if (parent && typeof parent.getAttribute === 'function') {
        const listenerCount = (+parent.getAttribute(LISTEN_FLAG)) - 1;
        const container = getContainer(parent);
        if (container) {
          container.components.splice(container.components.findIndex(item => item === this), 1);
          if (listenerCount === 0) {
            parent.removeEventListener('scroll', finalLazyLoadHandler, passiveEvent);
            parent.removeAttribute(LISTEN_FLAG);
            containerList.splice(containerList.findIndex(item => item.parent === parent), 1);
          } else {
            parent.setAttribute(LISTEN_FLAG, listenerCount);
          }
        }
      }
    }

    const index = listeners.indexOf(this);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      off(window, 'resize', finalLazyLoadHandler, passiveEvent);
      off(window, 'scroll', finalLazyLoadHandler, passiveEvent);
    }
  }

  render() {
    return this.visible ?
           this.props.children :
             this.props.placeholder ?
                this.props.placeholder :
                <div style={{ height: this.props.height }} className="lazyload-placeholder" />;
  }
}

LazyLoad.propTypes = {
  once: PropTypes.bool,
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  offset: PropTypes.oneOfType([PropTypes.number, PropTypes.arrayOf(PropTypes.number)]),
  overflow: PropTypes.bool,
  resize: PropTypes.bool,
  scroll: PropTypes.bool,
  children: PropTypes.node,
  throttle: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]),
  debounce: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]),
  placeholder: PropTypes.node,
  scrollContainer: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  unmountIfInvisible: PropTypes.bool
};

LazyLoad.defaultProps = {
  once: false,
  offset: 0,
  overflow: false,
  resize: false,
  scroll: true,
  unmountIfInvisible: false
};

export const lazyload = decorator;
export default LazyLoad;
export { lazyLoadHandler as forceCheck };
