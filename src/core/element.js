import Position from './position';
import { ANIMATION_DURATION_MS, CLASS_DRIVER_HIGHLIGHTED_ELEMENT, CLASS_DRIVER_HIGHLIGHTED_ELEMENT_STATIC } from '../common/constants';

/**
 * Wrapper around DOMElements to enrich them
 * with the functionality necessary
 */
export default class Element {
  /**
   * DOM element object
   * @param {Node|HTMLElement} node
   * @param {Object} options
   * @param {Popover} popover
   * @param {Stage} stage
   * @param {Overlay} overlay
   * @param {Window} window
   * @param {Document} document
   */
  constructor({
    node,
    options,
    popover,
    stage,
    overlay,
    window,
    document,
  } = {}) {
    this.node = node;
    this.document = document;
    this.window = window;
    this.options = options;
    this.overlay = overlay;
    this.popover = popover;
    this.stage = stage;

    this.animationTimeout = null;
  }

  /**
   * Gets the screen co-ordinates (x,y) for the current dom element
   * @returns {{x: number, y: number}}
   */
  getScreenCoordinates() {
    let tempNode = this.node;

    let x = this.document.documentElement.offsetLeft;
    let y = this.document.documentElement.offsetTop;

    if (tempNode.offsetParent) {
      do {
        x += tempNode.offsetLeft;
        y += tempNode.offsetTop;
      } while (tempNode = tempNode.offsetParent);
    }

    return { x, y };
  }

  /**
   * Checks if the current element is visible in viewport
   * @returns {boolean}
   */
  isInView() {
    let top = this.node.offsetTop;
    let left = this.node.offsetLeft;
    const width = this.node.offsetWidth;
    const height = this.node.offsetHeight;

    let el = this.node;

    while (el.offsetParent) {
      el = el.offsetParent;
      top += el.offsetTop;
      left += el.offsetLeft;
    }

    return (
      top >= this.window.pageYOffset &&
      left >= this.window.pageXOffset &&
      (top + height) <= (this.window.pageYOffset + this.window.innerHeight) &&
      (left + width) <= (this.window.pageXOffset + this.window.innerWidth)
    );
  }

  /**
   * Manually scrolls to the position of element if `scrollIntoView` fails
   */
  scrollManually() {
    const elementRect = this.node.getBoundingClientRect();
    const absoluteElementTop = elementRect.top + this.window.pageYOffset;
    const middle = absoluteElementTop - (this.window.innerHeight / 2);

    this.window.scrollTo(0, middle);
  }

  /**
   * Brings the element to middle of the view port if not in view
   */
  bringInView() {
    if (this.isInView()) {
      return;
    }

    // If browser does not support scrollIntoView
    if (!this.node.scrollIntoView) {
      this.scrollManually();
      return;
    }

    try {
      this.node.scrollIntoView(this.options.scrollIntoViewOptions || {
        behavior: 'smooth',
        block: 'center',
      });
    } catch (e) {
      // `block` option is not allowed in older versions of firefox, scroll manually
      this.scrollManually();
    }
  }

  /**
   * Gets the calculated position on screen, around which
   * we need to draw
   */
  getCalculatedPosition() {
    const coordinates = this.getScreenCoordinates();
    const position = new Position({
      left: Number.MAX_VALUE,
      top: Number.MAX_VALUE,
      right: 0,
      bottom: 0,
    });

    // If we have the position for this element
    // and the element is visible on screen (has some height)
    if (typeof coordinates.x === 'number' && typeof coordinates.y === 'number' && (this.node.offsetWidth > 0 || this.node.offsetHeight > 0)) {
      position.left = Math.min(position.left, coordinates.x);
      position.top = Math.min(position.top, coordinates.y);
      position.right = Math.max(position.right, coordinates.x + this.node.offsetWidth);
      position.bottom = Math.max(position.bottom, coordinates.y + this.node.offsetHeight);
    }

    return position;
  }

  /**
   * Is called when element is about to be deselected
   * i.e. when moving the focus to next element of closing
   */
  onDeselected(hideStage = false) {
    this.hidePopover();

    if (hideStage) {
      this.hideStage();
    }

    this.node.classList.remove(CLASS_DRIVER_HIGHLIGHTED_ELEMENT, CLASS_DRIVER_HIGHLIGHTED_ELEMENT_STATIC);

    // If there was any animation in progress, cancel that
    this.window.clearTimeout(this.animationTimeout);

    if (this.options.onDeselected) {
      this.options.onDeselected(this);
    }
  }

  /**
   * Checks if the given element is same as the current element
   * @param {Element} element
   * @returns {boolean}
   */
  isSame(element) {
    if (!element || !element.node) {
      return false;
    }

    return element.node === this.node;
  }

  /**
   * Is called when the element is about to be highlighted
   * i.e. either if overlay has started moving the highlight towards
   * this element of has just decided to highlight it
   */
  onHighlightStarted() {
    if (this.options.onHighlightStarted) {
      this.options.onHighlightStarted(this);
    }
  }

  /**
   * Is called when the element has been successfully highlighted
   */
  onHighlighted() {
    this.showPopover();
    this.showStage();

    this.node.classList.add(CLASS_DRIVER_HIGHLIGHTED_ELEMENT);

    if (this.options.isStatic) {
      this.node.classList.add(CLASS_DRIVER_HIGHLIGHTED_ELEMENT_STATIC);
    }

    const highlightedElement = this;
    const popoverElement = this.popover;

    if (popoverElement && !popoverElement.isInView()) {
      popoverElement.bringInView();
    }

    if (!highlightedElement.isInView()) {
      highlightedElement.bringInView();
    }

    if (this.options.onHighlighted) {
      this.options.onHighlighted(this);
    }
  }

  /**
   * Shows the stage behind the element
   */
  showStage() {
    this.stage.show(this.getCalculatedPosition());
  }

  /**
   * Gets the DOM Element behind this element
   * @returns {Node|HTMLElement|*}
   */
  getNode() {
    return this.node;
  }

  hideStage() {
    this.stage.hide();
  }

  hidePopover() {
    if (!this.popover) {
      return;
    }

    this.popover.hide();
  }

  /**
   * Shows the popover on the current element
   */
  showPopover() {
    if (!this.popover) {
      return;
    }

    const showAtPosition = this.getCalculatedPosition();

    // For first highlight, show it immediately because there won't be any animation
    let showAfterMs = ANIMATION_DURATION_MS;
    // If animation is disabled or  if it is the first display, show it immediately
    if (!this.options.animate || !this.overlay.lastHighlightedElement) {
      showAfterMs = 0;
    }

    this.animationTimeout = this.window.setTimeout(() => {
      this.popover.show(showAtPosition);
    }, showAfterMs);
  }

  /**
   * @returns {{height: number, width: number}}
   */
  getFullPageSize() {
    // eslint-disable-next-line prefer-destructuring
    const body = this.document.body;
    const html = this.document.documentElement;

    return {
      height: Math.max(body.scrollHeight, body.offsetHeight, html.scrollHeight, html.offsetHeight),
      width: Math.max(body.scrollWidth, body.offsetWidth, html.scrollWidth, html.offsetWidth),
    };
  }

  /**
   * Gets the size for popover
   * @returns {{height: number, width: number}}
   */
  getSize() {
    return {
      height: Math.max(this.node.scrollHeight, this.node.offsetHeight),
      width: Math.max(this.node.scrollWidth, this.node.offsetWidth),
    };
  }
}
