'use strict';

module.exports = (client, { d: data }) => {
  let msg;
  switch (data.required_action) {
    case undefined:
    case null: {
      msg = 'All required actions have been completed.';
      break;
    }
    case 'AGREEMENTS': {
      // Only the account owner can agree to new terms, so the library does not accept them on their behalf
      msg = 'You need to accept the new Terms of Service and Privacy Policy in the Discord app.';
      break;
    }
    case 'REQUIRE_CAPTCHA': {
      msg = 'You need to complete a captcha.';
      break;
    }
    case 'REQUIRE_VERIFIED_EMAIL': {
      msg = 'You need to verify your email.';
      break;
    }
    case 'REQUIRE_REVERIFIED_EMAIL': {
      msg = 'You need to reverify your email.';
      break;
    }
    case 'REQUIRE_VERIFIED_PHONE': {
      msg = 'You need to verify your phone number.';
      break;
    }
    case 'REQUIRE_REVERIFIED_PHONE': {
      msg = 'You need to reverify your phone number.';
      break;
    }
    case 'REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE': {
      msg = 'You need to verify your email or verify your phone number.';
      break;
    }
    case 'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE': {
      msg = 'You need to reverify your email or verify your phone number.';
      break;
    }
    case 'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE': {
      msg = 'You need to verify your email or reverify your phone number.';
      break;
    }
    case 'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE': {
      msg = 'You need to reverify your email or reverify your phone number.';
      break;
    }
    default: {
      msg = `Unknown required action: ${data.required_action}`;
      break;
    }
  }
  client.emit('debug', `[USER_REQUIRED_ACTION] ${msg}`);
};
