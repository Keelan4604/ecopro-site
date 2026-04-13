/* ============================================
   EcoPro USA — Site Scripts
   ============================================ */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header scroll effect ---------- */
  var header = document.getElementById('site-header');

  function onScroll() {
    if (window.scrollY > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  // Only add scroll toggle on homepage (subpages always have .scrolled)
  if (!header.classList.contains('scrolled')) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  var toggle = document.getElementById('mobile-toggle');
  var nav = document.getElementById('main-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
    });

    nav.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduceMotion) {
    var reveals = document.querySelectorAll('.reveal');
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* ---------- Hero background slider (homepage only) ---------- */
  var heroSlides = document.querySelectorAll('.hero-slide');
  var currentSlide = 0;

  if (heroSlides.length > 1 && !reduceMotion) {
    setInterval(function () {
      heroSlides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % heroSlides.length;
      heroSlides[currentSlide].classList.add('active');
    }, 5000);
  }

  /* ---------- Animated counters (homepage only) ---------- */
  var counters = document.querySelectorAll('.stat-number[data-target]');
  var countersAnimated = false;

  function animateCounters() {
    if (countersAnimated) return;
    countersAnimated = true;

    counters.forEach(function (counter) {
      var target = parseInt(counter.getAttribute('data-target'), 10);
      var prefix = counter.getAttribute('data-prefix') || '';
      var suffix = counter.getAttribute('data-suffix') || '';
      var duration = 2000;
      var startTime = null;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.floor(eased * target);
        counter.textContent = prefix + current.toLocaleString() + suffix;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          counter.textContent = prefix + target.toLocaleString() + suffix;
        }
      }

      if (reduceMotion) {
        counter.textContent = prefix + target.toLocaleString() + suffix;
      } else {
        requestAnimationFrame(step);
      }
    });
  }

  var statsEl = document.querySelector('.hero-stats');
  if (statsEl) {
    var statsObserver = new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    statsObserver.observe(statsEl);
  }

  /* ---------- Testimonials slider (homepage only) ---------- */
  var track = document.querySelector('.testimonials-track');
  var dotsContainer = document.getElementById('slider-dots');
  var prevBtn = document.querySelector('.slider-prev');
  var nextBtn = document.querySelector('.slider-next');

  if (track && dotsContainer && prevBtn && nextBtn) {
    var cards = track.querySelectorAll('.testimonial-card');
    var currentTestimonial = 0;
    var totalTestimonials = cards.length;

    for (var i = 0; i < totalTestimonials; i++) {
      var dot = document.createElement('button');
      dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
      dot.setAttribute('data-index', i);
      dotsContainer.appendChild(dot);
    }

    var dots = dotsContainer.querySelectorAll('.slider-dot');

    function goToSlide(index) {
      currentTestimonial = index;
      track.style.transform = 'translateX(-' + (index * 100) + '%)';
      dots.forEach(function (d, idx) {
        d.classList.toggle('active', idx === index);
      });
    }

    prevBtn.addEventListener('click', function () {
      goToSlide(currentTestimonial === 0 ? totalTestimonials - 1 : currentTestimonial - 1);
    });

    nextBtn.addEventListener('click', function () {
      goToSlide((currentTestimonial + 1) % totalTestimonials);
    });

    dotsContainer.addEventListener('click', function (e) {
      if (e.target.classList.contains('slider-dot')) {
        goToSlide(parseInt(e.target.getAttribute('data-index'), 10));
      }
    });

    if (!reduceMotion) {
      setInterval(function () {
        goToSlide((currentTestimonial + 1) % totalTestimonials);
      }, 7000);
    }
  }

  /* ---------- Product tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tabsContainer = this.closest('.product-tabs');
      var targetId = this.getAttribute('data-tab');

      // Deactivate all tabs in this container
      tabsContainer.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      tabsContainer.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.remove('active');
      });

      // Activate clicked tab
      this.classList.add('active');
      var targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  /* ---------- Smooth scroll for anchor links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (href === '#') return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  });

  /* ---------- Product gallery thumbnail click ---------- */
  document.querySelectorAll('.gallery-thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var mainImg = document.getElementById('product-main-img');
      if (mainImg) {
        mainImg.src = this.getAttribute('data-src');
      }
    });
  });

  /* ---------- Contact form AJAX submission ---------- */
  var contactForm = document.getElementById('contact-form');
  if (contactForm && contactForm.dataset.ajax === 'true') {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = this;
      var btn = form.querySelector('.form-submit');
      var originalText = btn.textContent;

      // Collect form data
      var data = {};
      var formData = new FormData(form);
      var products = [];
      formData.forEach(function (value, key) {
        if (key === 'products') {
          products.push(value);
        } else {
          data[key] = value;
        }
      });
      if (products.length) data.products = products;

      // Disable button
      btn.disabled = true;
      btn.textContent = 'Sending...';

      // Remove any existing messages
      var existingMsg = form.querySelector('.form-message');
      if (existingMsg) existingMsg.remove();

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (result) {
          var msg = document.createElement('div');
          msg.className = 'form-message ' + (result.ok ? 'form-message-success' : 'form-message-error');
          if (result.ok) {
            msg.innerHTML = '<strong>Message sent!</strong> ' + (result.data.message || 'We\'ll be in touch soon.');
            form.reset();
          } else {
            var errText = result.data.error || 'Something went wrong.';
            if (result.data.details) errText += ' ' + result.data.details.join(', ');
            msg.innerHTML = '<strong>Error:</strong> ' + errText;
          }
          form.insertBefore(msg, btn.parentNode || btn);
          btn.disabled = false;
          btn.textContent = originalText;
        })
        .catch(function () {
          var msg = document.createElement('div');
          msg.className = 'form-message form-message-error';
          msg.innerHTML = '<strong>Connection error.</strong> Please call us at 855-ECO-PRO2.';
          form.insertBefore(msg, btn.parentNode || btn);
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });
  }

  /* ---------- Phone input formatting ---------- */
  var phoneInput = document.getElementById('phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var digits = this.value.replace(/\D/g, '').substring(0, 10);
      if (digits.length >= 7) {
        this.value = '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6);
      } else if (digits.length >= 4) {
        this.value = '(' + digits.substring(0, 3) + ') ' + digits.substring(3);
      } else if (digits.length > 0) {
        this.value = '(' + digits;
      }
    });
  }

})();
