/**
 * vCard Parser/Formatter Tests
 *
 * Tests for RFC 6350 vCard parsing and formatting.
 */

import { describe, test, expect } from "bun:test";
import { parseVCard, formatVCard } from "../src/vcard.ts";

describe("parseVCard", () => {
  test("parses basic vCard", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:contact-123
FN:John Doe
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.uid).toBe("contact-123");
    expect(contact!.fullName).toBe("John Doe");
  });

  test("parses structured name", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:structured-name
FN:Dr. John Michael Doe Jr.
N:Doe;John;Michael;Dr.;Jr.
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.name).toEqual({
      family: "Doe",
      given: "John",
      middle: "Michael",
      prefix: "Dr.",
      suffix: "Jr.",
    });
  });

  test("parses emails with types", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:with-emails
FN:Jane Doe
EMAIL;TYPE=work:jane@work.com
EMAIL;TYPE=home;PREF:jane@home.com
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.emails).toHaveLength(2);
    expect(contact!.emails![0]).toEqual({
      value: "jane@work.com",
      type: "work",
      primary: false,
    });
    expect(contact!.emails![1]).toEqual({
      value: "jane@home.com",
      type: "home",
      primary: true,
    });
  });

  test("parses phone numbers with types", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:with-phones
FN:Bob Smith
TEL;TYPE=cell;PREF:+1-555-123-4567
TEL;TYPE=work:+1-555-987-6543
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.phones).toHaveLength(2);
    expect(contact!.phones![0]).toEqual({
      value: "+1-555-123-4567",
      type: "cell",
      primary: true,
    });
    expect(contact!.phones![1]).toEqual({
      value: "+1-555-987-6543",
      type: "work",
      primary: false,
    });
  });

  test("parses addresses", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:with-address
FN:Carol White
ADR;TYPE=home:;;123 Main St;Anytown;CA;12345;USA
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.addresses).toHaveLength(1);
    expect(contact!.addresses![0]).toEqual({
      type: "home",
      street: "123 Main St",
      city: "Anytown",
      region: "CA",
      postalCode: "12345",
      country: "USA",
    });
  });

  test("parses organization and title", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:with-org
FN:Dave Wilson
ORG:Acme Corp
TITLE:Software Engineer
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.org).toBe("Acme Corp");
    expect(contact!.title).toBe("Software Engineer");
  });

  test("parses birthday and note", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:with-bday
FN:Eve Brown
BDAY:1990-06-15
NOTE:Birthday buddy
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    expect(contact!.birthday).toBe("1990-06-15");
    expect(contact!.note).toBe("Birthday buddy");
  });

  test("handles folded lines", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:folded-contact
FN:A Very Long Name That Would Be
 Folded Across Multiple Lines
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).not.toBeNull();
    // Folding removes newline and leading whitespace, joining directly
    expect(contact!.fullName).toBe(
      "A Very Long Name That Would BeFolded Across Multiple Lines",
    );
  });

  test("returns null for vCard without required fields", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
FN:No UID
END:VCARD`;

    const contact = parseVCard(vcard);
    expect(contact).toBeNull();
  });
});

describe("formatVCard", () => {
  test("formats basic contact", () => {
    const contact = {
      uid: "contact-123",
      fullName: "John Doe",
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("VERSION:4.0");
    expect(vcard).toContain("UID:contact-123");
    expect(vcard).toContain("FN:John Doe");
    expect(vcard).toContain("END:VCARD");
  });

  test("formats structured name", () => {
    const contact = {
      uid: "with-name",
      fullName: "Dr. John Doe",
      name: {
        family: "Doe",
        given: "John",
        prefix: "Dr.",
      },
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("N:Doe;John;;Dr.;");
  });

  test("formats emails with types and preference", () => {
    const contact = {
      uid: "with-emails",
      fullName: "Jane Doe",
      emails: [
        { value: "jane@work.com", type: "work" as const },
        { value: "jane@home.com", type: "home" as const, primary: true },
      ],
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("EMAIL;TYPE=WORK:jane@work.com");
    expect(vcard).toContain("EMAIL;TYPE=HOME;PREF=1:jane@home.com");
  });

  test("formats phone numbers", () => {
    const contact = {
      uid: "with-phones",
      fullName: "Bob Smith",
      phones: [
        { value: "+1-555-123-4567", type: "cell" as const, primary: true },
      ],
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("TEL;TYPE=CELL;PREF=1:+1-555-123-4567");
  });

  test("formats addresses", () => {
    const contact = {
      uid: "with-address",
      fullName: "Carol White",
      addresses: [
        {
          type: "home" as const,
          street: "123 Main St",
          city: "Anytown",
          region: "CA",
          postalCode: "12345",
          country: "USA",
        },
      ],
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("ADR;TYPE=HOME:;;123 Main St;Anytown;CA;12345;USA");
  });

  test("formats organization and title", () => {
    const contact = {
      uid: "with-org",
      fullName: "Dave Wilson",
      org: "Acme Corp",
      title: "Engineer",
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("ORG:Acme Corp");
    expect(vcard).toContain("TITLE:Engineer");
  });

  test("formats photo URL", () => {
    const contact = {
      uid: "with-photo",
      fullName: "Eve Brown",
      photo: "https://example.com/photo.jpg",
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("PHOTO:https://example.com/photo.jpg");
  });

  test("formats photo base64", () => {
    const contact = {
      uid: "with-photo-b64",
      fullName: "Frank Green",
      photo: "abc123base64data",
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("PHOTO:data:image/jpeg;base64,abc123base64data");
  });

  test("escapes special characters", () => {
    const contact = {
      uid: "special-chars",
      fullName: "Smith; Jones, Inc.",
      note: "Line 1\nLine 2",
    };

    const vcard = formatVCard(contact);
    expect(vcard).toContain("FN:Smith\\; Jones\\, Inc.");
    expect(vcard).toContain("NOTE:Line 1\\nLine 2");
  });
});

describe("round-trip", () => {
  test("parse then format preserves data", () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
UID:round-trip-test
FN:Test Person
N:Person;Test;;;
EMAIL;TYPE=work:test@example.com
TEL;TYPE=cell:+1-555-123-4567
ORG:Test Org
TITLE:Tester
END:VCARD`;

    const contact = parseVCard(vcard)!;
    expect(contact).not.toBeNull();

    const formatted = formatVCard(contact);
    const reparsed = parseVCard(formatted)!;

    expect(reparsed.uid).toBe(contact.uid);
    expect(reparsed.fullName).toBe(contact.fullName);
    expect(reparsed.org).toBe(contact.org);
    expect(reparsed.title).toBe(contact.title);
    expect(reparsed.emails).toHaveLength(1);
    expect(reparsed.phones).toHaveLength(1);
  });
});
