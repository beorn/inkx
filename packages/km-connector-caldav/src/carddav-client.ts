/**
 * CardDAV Client
 *
 * WebDAV-based client for CardDAV contacts sync.
 * Implements RFC 6352 (CardDAV).
 */

import type { CardDAVConfig, Contact, SyncState, SyncResult } from "./types.ts";
import { parseVCard, formatVCard } from "./vcard.ts";
import { createBasicAuthHeader, webdavRequest } from "./webdav-base.ts";

/**
 * CardDAV client for syncing contacts
 */
export class CardDAVClient {
  private config: CardDAVConfig;
  private addressBookUrl: string | null = null;
  private authHeader: string;

  constructor(config: CardDAVConfig) {
    this.config = config;
    this.authHeader = createBasicAuthHeader(config.username, config.password);
  }

  /**
   * Make a WebDAV request
   */
  private async request(
    method: string,
    url: string,
    body?: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return webdavRequest(method, url, this.authHeader, body, headers);
  }

  /**
   * Discover the address book URL using PROPFIND
   */
  async discover(): Promise<string> {
    if (this.config.addressBookPath) {
      this.addressBookUrl = `${this.config.url}${this.config.addressBookPath}`;
      return this.addressBookUrl;
    }

    // Use current-user-principal to find addressbook home
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`;

    const response = await this.request("PROPFIND", this.config.url, propfind, {
      Depth: "0",
    });

    const text = await response.text();
    const principalMatch = text.match(/<D:href>([^<]+)<\/D:href>/);

    if (principalMatch) {
      const principalUrl = principalMatch[1];
      // Find addressbook-home-set
      const homeResponse = await this.request(
        "PROPFIND",
        `${this.config.url}${principalUrl}`,
        `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <C:addressbook-home-set/>
  </D:prop>
</D:propfind>`,
        { Depth: "0" },
      );

      const homeText = await homeResponse.text();
      const homeMatch = homeText.match(
        /<C:addressbook-home-set>.*?<D:href>([^<]+)<\/D:href>/s,
      );
      if (homeMatch) {
        this.addressBookUrl = `${this.config.url}${homeMatch[1]}`;
        return this.addressBookUrl;
      }
    }

    // Fallback: use the config URL directly
    this.addressBookUrl = this.config.url;
    return this.addressBookUrl;
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<Contact[]> {
    if (!this.addressBookUrl) {
      await this.discover();
    }

    const report = `<?xml version="1.0" encoding="utf-8"?>
<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <C:address-data/>
  </D:prop>
</C:addressbook-query>`;

    const response = await this.request(
      "REPORT",
      this.addressBookUrl ?? "",
      report,
      {
        Depth: "1",
      },
    );

    const text = await response.text();
    const contacts: Contact[] = [];

    // Parse multiget response
    const responseRegex =
      /<D:response>[\s\S]*?<D:href>([^<]+)<\/D:href>[\s\S]*?<D:getetag>"?([^"<]+)"?<\/D:getetag>[\s\S]*?<C:address-data[^>]*>([\s\S]*?)<\/C:address-data>[\s\S]*?<\/D:response>/g;

    let match;
    while ((match = responseRegex.exec(text)) !== null) {
      const etag = match[2];
      const vcardData = match[3]
        ?.replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      if (vcardData) {
        const contact = parseVCard(vcardData);
        if (contact) {
          contact.etag = etag;
          contact.raw = vcardData;
          contacts.push(contact);
        }
      }
    }

    return contacts;
  }

  /**
   * Create a new contact
   */
  async createContact(contact: Contact): Promise<void> {
    if (!this.addressBookUrl) {
      await this.discover();
    }

    const vcard = formatVCard(contact);
    const url = `${this.addressBookUrl}/${contact.uid}.vcf`;

    await this.request("PUT", url, vcard, {
      "Content-Type": "text/vcard; charset=utf-8",
      "If-None-Match": "*",
    });
  }

  /**
   * Update an existing contact
   */
  async updateContact(contact: Contact): Promise<void> {
    if (!this.addressBookUrl) {
      await this.discover();
    }

    const vcard = formatVCard(contact);
    const url = `${this.addressBookUrl}/${contact.uid}.vcf`;

    const headers: Record<string, string> = {
      "Content-Type": "text/vcard; charset=utf-8",
    };
    if (contact.etag) {
      headers["If-Match"] = contact.etag;
    }

    await this.request("PUT", url, vcard, headers);
  }

  /**
   * Delete a contact
   */
  async deleteContact(uid: string, etag?: string): Promise<void> {
    if (!this.addressBookUrl) {
      await this.discover();
    }

    const url = `${this.addressBookUrl}/${uid}.vcf`;
    const headers: Record<string, string> = {};
    if (etag) {
      headers["If-Match"] = etag;
    }

    await this.request("DELETE", url, undefined, headers);
  }

  /**
   * Sync contacts
   */
  async sync(state?: SyncState): Promise<SyncResult> {
    if (!this.addressBookUrl) {
      await this.discover();
    }

    const result: SyncResult = {
      added: [],
      modified: [],
      deleted: [],
      state: state || { etags: {} },
    };

    // Full sync - get all contacts and compare
    const contacts = await this.getContacts();
    const newEtags: Record<string, string> = {};

    for (const contact of contacts) {
      newEtags[contact.uid] = contact.etag || "";

      if (state?.etags[contact.uid]) {
        if (state.etags[contact.uid] !== contact.etag) {
          result.modified.push(contact.uid);
        }
      } else {
        result.added.push(contact.uid);
      }
    }

    // Find deleted
    if (state?.etags) {
      for (const uid of Object.keys(state.etags)) {
        if (!newEtags[uid]) {
          result.deleted.push(uid);
        }
      }
    }

    result.state.etags = newEtags;
    result.state.lastSync = Date.now();

    return result;
  }
}
