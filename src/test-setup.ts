/**
 * Test Setup
 * ==========
 * 
 * This file is loaded before all tests and sets up the testing environment.
 */

import { vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock console.error to reduce noise in tests
vi.spyOn(console, "error").mockImplementation(() => {});
