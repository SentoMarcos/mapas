(function () {
  var timelineState = new WeakMap();

  function init() {
    var timelines = document.querySelectorAll('.timeline');
    if (!timelines.length) {
      return;
    }
    timelines.forEach(setupTimeline);
  }

  function setupTimeline(timeline) {
    var track = timeline.querySelector('.timeline-track');
    if (!track) {
      return;
    }
    enableDragScroll(timeline, track);
    enableEventToggle(timeline);
    enableResetButton(timeline, track);
  }

  function enableDragScroll(timeline, track) {
    var pointerActive = false;
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var startScroll = 0;
    var startOffsetY = 0;
    var moved = false;
    var storedState = timelineState.get(timeline);
    var offsetY = storedState ? storedState.getOffset() : 0;
    var maxOffset = storedState ? storedState.maxOffset : getMaxOffset(timeline);

    var applyOffset = function (value) {
      offsetY = clamp(value, -maxOffset, maxOffset);
      track.style.setProperty('--track-offset-y', offsetY + 'px');
      return offsetY;
    };

    applyOffset(offsetY);

    timelineState.set(timeline, {
      getOffset: function () {
        return offsetY;
      },
      setOffset: function (value) {
        return applyOffset(value);
      },
      resetOffset: function () {
        return applyOffset(0);
      },
      maxOffset: maxOffset
    });

    timeline.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 && event.pointerType === 'mouse') {
        return;
      }
      if (event.target.closest('.timeline-reset')) {
        return;
      }
      pointerActive = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScroll = timeline.scrollLeft;
      startOffsetY = offsetY;
      moved = false;
      timeline.setPointerCapture && timeline.setPointerCapture(pointerId);
    });

    timeline.addEventListener('pointermove', function (event) {
      if (!pointerActive || pointerId !== event.pointerId) {
        return;
      }
      var deltaX = event.clientX - startX;
      var deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        moved = true;
        timeline.classList.add('is-grabbing');
      }
      timeline.scrollLeft = startScroll - deltaX;
      applyOffset(startOffsetY + deltaY);
      if (moved) {
        event.preventDefault();
      }
    });

    var stop = function (event) {
      if (!pointerActive) {
        return;
      }
      if (pointerId === event.pointerId || event.type === 'pointerleave') {
        pointerActive = false;
        timeline.classList.remove('is-grabbing');
        timeline.releasePointerCapture && pointerId !== null && timeline.releasePointerCapture(pointerId);
        pointerId = null;
        if (moved) {
          timeline.dataset.suppressClick = 'true';
          requestAnimationFrame(function () {
            delete timeline.dataset.suppressClick;
          });
        }
      }
    };

    timeline.addEventListener('pointerup', stop);
    timeline.addEventListener('pointerleave', stop);
    timeline.addEventListener('pointercancel', stop);

    timeline.addEventListener('wheel', function (event) {
      if (event.ctrlKey) {
        return;
      }
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        applyOffset(offsetY - event.deltaY * 0.4);
        event.preventDefault();
      } else {
        timeline.scrollLeft += event.deltaX || event.deltaY;
        event.preventDefault();
      }
    }, { passive: false });
  }

  function enableEventToggle(timeline) {
    var events = timeline.querySelectorAll('.timeline-event');
    if (!events.length) {
      return;
    }

    var closeOthers = function (exception) {
      events.forEach(function (item) {
        if (item !== exception) {
          item.classList.remove('is-open');
        }
      });
    };

    events.forEach(function (eventEl) {
      var handleToggle = function () {
        if (timeline.dataset.suppressClick === 'true') {
          return;
        }
        var isOpen = eventEl.classList.contains('is-open');
        closeOthers(eventEl);
        if (!isOpen) {
          eventEl.classList.add('is-open');
        } else {
          eventEl.classList.remove('is-open');
        }
      };

      var trigger = eventEl.querySelector('.timeline-node') || eventEl;
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        handleToggle();
      });

      trigger.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleToggle();
        }
      });
    });
  }

  function enableResetButton(timeline, track) {
    var button = timeline.querySelector('.timeline-reset');
    if (!button) {
      return;
    }
    button.addEventListener('click', function () {
      timeline.scrollTo({ left: 0, behavior: 'smooth' });
      var state = timelineState.get(timeline);
      if (state && state.resetOffset) {
        state.resetOffset();
      } else {
        track.style.setProperty('--track-offset-y', '0px');
      }
    });
  }

  function getMaxOffset(timeline) {
    var parsed = Number(timeline.dataset.maxOffset);
    return Number.isFinite(parsed) ? parsed : 140;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
