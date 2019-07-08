const gmail = require("./gmail");
const fs = require("fs");
const { google } = require("googleapis");
const util = require("util");

function _get_header(name, headers) {
  const found = headers.find(h => h.name === name)
  return found && found.value
}

async function _get_recent_email(credentials_json, token_path, options = {}) {
  const emails = [];
  // Load client secrets from a local file.
  const content = fs.readFileSync(credentials_json);
  const oAuth2Client = await gmail.authorize(JSON.parse(content), token_path);
  const gmail_client = google.gmail({ version: "v1", oAuth2Client });
  const gmail_emails = await gmail.get_recent_email(gmail_client, oAuth2Client);
  for (const gmail_email of gmail_emails) {
    const email = {
      from: _get_header("From", gmail_email.payload.headers),
      id: gmail_email.id,
      subject: _get_header("Subject", gmail_email.payload.headers),
      receiver: _get_header("Delivered-To", gmail_email.payload.headers)
    };
    if (options.include_body) {
      let email_body = { html: "", text: "" };
      const { body } = gmail_email.payload;
      if (body.size) {
        switch (gmail_email.payload.mimeType) {
          case "text/html":
            email_body.html = Buffer.from(body.data, "base64").toString("utf8");
            break;
          case "text/plain":
          default:
            email_body.text = Buffer.from(body.data, "base64").toString("utf8");
            break;
        }
      } else {
        let body_part = gmail_email.payload.parts.find(
          p => p.mimeType === "text/html"
        );
        if (body_part) {
          email_body.html = Buffer.from(body_part.body.data, "base64").toString(
            "utf8"
          );
        }
        body_part = gmail_email.payload.parts.find(
          p => p.mimeType === "text/plain"
        );
        if (body_part) {
          email_body.text = Buffer.from(body_part.body.data, "base64").toString(
            "utf8"
          );
        }
      }

      email.body = email_body;
    }
    emails.push(email);
  }
  return emails;
}

async function check_inbox(
  credentials_json,
  token_path,
  subject,
  from,
  to,
  wait_time_sec = 30,
  max_wait_time_sec = 60
) {
  try {
    console.log(
      `[gmail] Checking for message from '${from}', to: ${to}, contains '${subject}' in subject...`
    );
    // Load client secrets from a local file.
    let found_email = null;
    let done_waiting_time = 0;
    do {
      const emails = await _get_recent_email(credentials_json, token_path);
      for (let email of emails) {
        if (
          email.receiver === to &&
          email.subject.indexOf(subject) >= 0 &&
          email.from.indexOf(from) >= 0
        ) {
          console.log(`[gmail] Found!`);
          found_email = email;
          break;
        }
      }
      if (!found_email) {
        console.log(
          `[gmail] Message not found. Waiting ${wait_time_sec} seconds...`
        );
        done_waiting_time += wait_time_sec;
        if (done_waiting_time >= max_wait_time_sec) {
          console.log("[gmail] Maximum waiting time exceeded!");
          break;
        }
        await util.promisify(setTimeout)(wait_time_sec * 1000);
      }
    } while (!found_email);
    return found_email;
  } catch (err) {
    console.log("[gmail] Error:", err);
  }
}

/**
 * Get an array of messages
 *
 * @param {string} credentials_json - Path to credentials json file.
 * @param {string} token_path - Path to token json file.
 * @param {Object} options
 * @param {boolean} options.include_body - Return message body string.
 */
async function get_messages(credentials_json, token_path, options) {
  try {
    const emails = await _get_recent_email(
      credentials_json,
      token_path,
      options
    );
    return emails;
  } catch (err) {
    console.log("[gmail] Error:", err);
  }
}

async function trash_message(credentials_json, token_path, id) {
  const content = fs.readFileSync(credentials_json);
  const oAuth2Client = await gmail.authorize(JSON.parse(content), token_path);
  const gmail_client = google.gmail({ version: "v1", oAuth2Client });
  const res = await gmail.trash_email(gmail_client, oAuth2Client, id);
  return res;
}

module.exports = { check_inbox, get_messages, trash_message };
