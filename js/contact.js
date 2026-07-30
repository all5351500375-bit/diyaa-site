/**
 * Diyaa — contact page logic (extracted from contact.html so it can run
 * under a strict Content-Security-Policy with no inline scripts).
 */
(function () {
  'use strict';
  var Diyaa = window.Diyaa || {};

  // ── Copy email button ──
  var copyBtn = document.getElementById('copy-email-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async function () {
      var email = copyBtn.dataset.email;
      var ok = Diyaa.Utils ? await Diyaa.Utils.copyToClipboard(email) : false;
      if (ok) {
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 1800);
        if (Diyaa.Toast) Diyaa.Toast.show('Email address copied!', 'success');
      } else if (Diyaa.Toast) {
        Diyaa.Toast.show('Could not copy — the address is ' + email, 'error');
      }
    });
  }

  // ── Contact form validation + mailto submit ──
  var form = document.getElementById('contact-form');
  if (!form) return;

  var fields = {
    name: { input: document.getElementById('cf-name'), err: document.getElementById('err-name') },
    email: { input: document.getElementById('cf-email'), err: document.getElementById('err-email') },
    subject: { input: document.getElementById('cf-subject'), err: document.getElementById('err-subject') },
    message: { input: document.getElementById('cf-message'), err: document.getElementById('err-message') }
  };

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function validateField(key) {
    var f = fields[key];
    var v = f.input.value.trim();
    var msg = '';

    if (!v) {
      msg = 'This field is required.';
    } else if (key === 'email' && !isValidEmail(v)) {
      msg = 'Please enter a valid email address.';
    } else if (f.input.minLength > 0 && v.length < f.input.minLength) {
      msg = 'Please enter at least ' + f.input.minLength + ' characters.';
    }

    f.err.textContent = msg;
    f.input.classList.toggle('invalid', !!msg);
    return !msg;
  }

  Object.keys(fields).forEach(function (key) {
    fields[key].input.addEventListener('blur', function () { validateField(key); });
    fields[key].input.addEventListener('input', function () {
      if (fields[key].input.classList.contains('invalid')) validateField(key);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var allValid = Object.keys(fields).map(validateField).every(Boolean);
    var status = document.getElementById('cf-status');

    if (!allValid) {
      status.textContent = 'Please fix the highlighted fields above.';
      status.style.color = 'var(--danger)';
      return;
    }

    var name = fields.name.input.value.trim();
    var email = fields.email.input.value.trim();
    var subject = fields.subject.input.value.trim();
    var message = fields.message.input.value.trim();

    var body = 'Name: ' + name + '\nEmail: ' + email + '\n\n' + message;
    var mailto = 'mailto:aall0506641401@gmail.com' +
      '?subject=' + encodeURIComponent('[Diyaa] ' + subject) +
      '&body=' + encodeURIComponent(body);

    window.location.href = mailto;

    status.textContent = 'Opening your email app now — press send there to reach us.';
    status.style.color = 'var(--success)';
  });
})();
