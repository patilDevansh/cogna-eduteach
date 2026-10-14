import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPhoneCode, maskPhone, normalizePhone } from "../../src/parents/phone";

describe("parents' phone numbers", () => {
  it("every way of typing an Indian mobile becomes one number", () => {
    for (const typed of ["98765 43210", "098765-43210", "+91 98765 43210", "0091 9876543210", "(+91) 98765.43210"]) {
      assert.equal(normalizePhone(typed), "+919876543210", typed);
    }
    assert.equal(normalizePhone("+44 7700 900123"), "+447700900123", "other countries keep their code");
  });

  it("rejects what isn't a mobile", () => {
    for (const typed of ["", "12345", "1234567890", "+91 12345 67890", "98765 4321", "phone"]) assert.equal(normalizePhone(typed), null, typed);
  });

  it("masks all but the last four digits, and binds codes to the account and number", () => {
    assert.equal(maskPhone("+919876543210"), "+91 ••••• •3210");
    assert.notEqual(hashPhoneCode("p1", "+919876543210", "123456"), hashPhoneCode("p2", "+919876543210", "123456"));
    assert.notEqual(hashPhoneCode("p1", "+919876543210", "123456"), hashPhoneCode("p1", "+919876543211", "123456"));
  });
});
