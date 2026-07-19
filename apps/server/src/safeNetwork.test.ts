import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedAddress } from "./safeNetwork.js";

test("SSRF address filter blocks loopback, private, link-local, and metadata ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:172.16.0.1",
    "::ffff:169.254.169.254",
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});
