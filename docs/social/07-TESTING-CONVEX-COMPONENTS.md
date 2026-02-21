# Plan 7: Testing Convex Components

> Comprehensive testing strategy for `@convex-dev/workflow`, `@convex-dev/resend`, and `@convex-dev/presence` using Vitest, Convex's testing utilities, and MSW for mocking external APIs.

---

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Test Layers                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unit Tests (Vitest)                                            │
│  ├── Schema validation tests                                    │
│  ├── Function argument validation                               │
│  └── Helper function tests                                      │
│                                                                  │
│  Integration Tests (Convex Test Helpers)                        │
│  ├── Query tests with convexTest()                              │
│  ├── Mutation tests with convexTest()                           │
│  ├── Action tests with mocked fetch                             │
│  └── Workflow tests with step mocks                             │
│                                                                  │
│  E2E Tests (Playwright + Convex)                                │
│  ├── Full workflow execution                                    │
│  ├── Email delivery (test mode)                                 │
│  └── Presence real-time updates                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Setup

### 1. Install Testing Dependencies

```bash
# In apps/app (or root if shared)
bun add -D vitest @testing-library/react jsdom

# For Convex testing
bun add convex @convex-dev/workflow @convex-dev/resend @convex-dev/presence

# For mocking external APIs
bun add -D msw
```

### 2. Convex Test Helpers

Create a test utilities file for Convex testing:

```typescript
// convex/__tests__/helpers.ts
import { convexTest } from "convex-test";
import { expect, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Create a test instance with schema loaded
 */
export function createConvexTest() {
  const t = convexTest(schema);
  return t;
}

/**
 * Helper to create a test user
 */
export async function createTestUser(t: ReturnType<typeof convexTest>, overrides?: {
  clerkId?: string;
  username?: string;
  plan?: "free" | "pro";
}) {
  const userId = await t.mutation(api.users.ensureUser, {});
  
  if (overrides?.username) {
    await t.mutation(api.users.setUsername, {
      userId: userId as Id<"users">,
      username: overrides.username,
    });
  }
  
  return userId as Id<"users">;
}

/**
 * Helper to create a test board
 */
export async function createTestBoard(t: ReturnType<typeof convexTest>, authorId: Id<"users">, overrides?: {
  title?: string;
  visibility?: "public" | "unlisted";
}) {
  const result = await t.mutation(api.boards.publish, {
    title: overrides?.title ?? "Test Board",
    description: "Test description",
    category: "test",
    tagIds: [],
    tierData: { tiers: [], items: [] },
    itemCount: 0,
    tierCount: 0,
    visibility: overrides?.visibility ?? "public",
  });
  
  return result;
}

/**
 * Mock Clerk authentication
 */
export function mockClerkAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  t.setAuth({
    subject: `user_${userId}`,
    email: "test@example.com",
    name: "Test User",
  });
}
```

### 3. Vitest Config for Convex

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts", "./convex/__tests__/setup.ts"],
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "convex/_generated/**",
        "**/*.config.ts",
        "**/*.d.ts",
      ],
    },
  },
});
```

---

## Testing @convex-dev/workflow

### Unit Tests for Workflow Definitions

```typescript
// convex/__tests__/workflows.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createConvexTest, createTestUser } from "./helpers";
import { workflow, onBoardPublished } from "../workflows";
import { internal } from "../_generated/api";

describe("workflows", () => {
  describe("onBoardPublished", () => {
    it("should trigger all parallel steps", async () => {
      const t = createConvexTest();
      
      // Create test user and board
      const authorId = await createTestUser(t, { username: "testuser" });
      const { boardId } = await t.mutation(api.boards.publish, {
        title: "Test Board",
        description: "Test",
        category: "test",
        tagIds: [],
        tierData: { tiers: [], items: [] },
        itemCount: 0,
        tierCount: 0,
        visibility: "public",
      });

      // Mock the step functions to track calls
      const notifyFollowersMock = vi.fn();
      const sendEmailMock = vi.fn();
      const fanOutMock = vi.fn();

      t.mock(internal.alerts.notifyFollowers, notifyFollowersMock);
      t.mock(internal.emails.sendBoardPublishedEmail, sendEmailMock);
      t.mock(internal.feed.fanOutToFollowers, fanOutMock);

      // Start workflow
      await workflow.start(t, internal.workflows.onBoardPublished, {
        boardId,
        authorId,
        title: "Test Board",
      });

      // Verify all parallel steps were called
      expect(notifyFollowersMock).toHaveBeenCalled();
      expect(sendEmailMock).toHaveBeenCalled();
      expect(fanOutMock).toHaveBeenCalled();
    });

    it("should retry failed steps", async () => {
      const t = createConvexTest();
      
      const authorId = await createTestUser(t, { username: "testuser" });
      const { boardId } = await t.mutation(api.boards.publish, {
        title: "Test Board",
        description: "Test",
        category: "test",
        tagIds: [],
        tierData: { tiers: [], items: [] },
        itemCount: 0,
        tierCount: 0,
        visibility: "public",
      });

      // Mock step to fail twice, then succeed
      let callCount = 0;
      t.mock(internal.alerts.notifyFollowers, vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Simulated failure");
        }
      }));

      // Start workflow
      await workflow.start(t, internal.workflows.onBoardPublished, {
        boardId,
        authorId,
        title: "Test Board",
      });

      // Verify retry happened
      expect(callCount).toBe(3);
    });
  });
});
```

### Testing Workflow Parallelism

```typescript
// convex/__tests__/workflow-parallelism.test.ts
import { describe, it, expect } from "vitest";
import { createConvexTest } from "./helpers";
import { workflow } from "../workflows";
import { internal } from "../_generated/api";

describe("workflow parallelism", () => {
  it("should execute steps in parallel with Promise.all", async () => {
    const t = createConvexTest();
    const executionOrder: string[] = [];

    // Mock steps with delays to verify parallelism
    t.mock(internal.alerts.notifyFollowers, vi.fn().mockImplementation(async () => {
      executionOrder.push("notify-start");
      await new Promise(resolve => setTimeout(resolve, 100));
      executionOrder.push("notify-end");
    }));

    t.mock(internal.emails.sendBoardPublishedEmail, vi.fn().mockImplementation(async () => {
      executionOrder.push("email-start");
      await new Promise(resolve => setTimeout(resolve, 50));
      executionOrder.push("email-end");
    }));

    t.mock(internal.feed.fanOutToFollowers, vi.fn().mockImplementation(async () => {
      executionOrder.push("feed-start");
      await new Promise(resolve => setTimeout(resolve, 75));
      executionOrder.push("feed-end");
    }));

    const startTime = Date.now();

    await workflow.start(t, internal.workflows.onBoardPublished, {
      boardId: "board123" as any,
      authorId: "user123" as any,
      title: "Test",
    });

    const duration = Date.now() - startTime;

    // If parallel, should take ~100ms (longest step)
    // If sequential, would take ~225ms
    expect(duration).toBeLessThan(150);

    // Verify all started before any ended
    expect(executionOrder.indexOf("notify-start")).toBe(0);
    expect(executionOrder.indexOf("email-start")).toBe(1);
    expect(executionOrder.indexOf("feed-start")).toBe(2);
  });
});
```

---

## Testing @convex-dev/resend

### Unit Tests for Email Functions

```typescript
// convex/__tests__/emails.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createConvexTest, createTestUser } from "./helpers";
import { resend } from "../emails";
import { internal } from "../_generated/api";

describe("emails", () => {
  describe("sendWelcomeEmail", () => {
    it("should send email via Resend component", async () => {
      const t = createConvexTest();
      
      // Mock Resend sendEmail
      const sendEmailMock = vi.fn().mockResolvedValue({ id: "email_123" });
      t.mock(resend.sendEmail, sendEmailMock);

      // Call email action
      await t.action(internal.emails.sendWelcomeEmail, {
        email: "test@example.com",
        name: "Test User",
      });

      // Verify email was sent
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          from: "TierSet <hello@tierset.com>",
          to: "test@example.com",
          subject: expect.stringContaining("Welcome"),
        }),
      );
    });
  });

  describe("sendBoardPublishedEmail", () => {
    it("should not send if user has no email", async () => {
      const t = createConvexTest();
      const sendEmailMock = vi.fn();
      t.mock(resend.sendEmail, sendEmailMock);

      const userId = await createTestUser(t, { username: "testuser" });

      await t.action(internal.emails.sendBoardPublishedEmail, {
        authorId: userId,
        title: "Test Board",
      });

      // Should not send if no email
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });
});
```

### Integration Tests with Test Mode

```typescript
// convex/__tests__/resend-integration.test.ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { components } from "../_generated/api";
import { Resend } from "@convex-dev/resend";

describe("Resend integration", () => {
  it("should queue emails in test mode", async () => {
    const t = convexTest(schema);
    
    // Configure Resend in test mode
    const resend = new Resend(components.resend, {
      testMode: true,
    });

    // Send test email
    const emailId = await t.mutation(async (ctx) => {
      return await resend.sendEmail(ctx, {
        from: "Test <test@tierset.com>",
        to: "test@example.com",
        subject: "Test Email",
        html: "<p>Test content</p>",
      });
    });

    // Check email status
    const status = await t.mutation(async (ctx) => {
      return await resend.status(ctx, emailId);
    });

    expect(status).toBeDefined();
    expect(status.status).toBe("sent");
  });

  it("should track email delivery events", async () => {
    const t = convexTest(schema);
    
    const resend = new Resend(components.resend, {
      testMode: true,
      onEmailEvent: internal.emails.handleEmailEvent,
    });

    const emailId = await t.mutation(async (ctx) => {
      return await resend.sendEmail(ctx, {
        from: "Test <test@tierset.com>",
        to: "delivered@resend.dev", // Resend test email
        subject: "Delivery Test",
        html: "<p>Testing delivery</p>",
      });
    });

    // Simulate webhook event
    await t.mutation(async (ctx) => {
      await resend.handleResendEventWebhook(ctx, {
        json: () => Promise.resolve({
          type: "delivered",
          email_id: emailId,
        }),
      } as any);
    });

    const status = await t.mutation(async (ctx) => {
      return await resend.status(ctx, emailId);
    });

    expect(status.status).toBe("delivered");
  });
});
```

### Mocking External Resend API

```typescript
// convex/__tests__/resend-mock.test.ts
import { describe, it, expect, vi } from "vitest";
import { createConvexTest } from "./helpers";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Mock Resend API
const server = setupServer(
  http.post("https://api.resend.com/emails", async ({ request }) => {
    const body = await request.json();
    
    // Validate email structure
    expect(body).toHaveProperty("from");
    expect(body).toHaveProperty("to");
    expect(body).toHaveProperty("subject");
    
    return HttpResponse.json({
      id: "mock_email_id",
      from: body.from,
      to: body.to,
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Resend API mocking", () => {
  it("should call Resend API with correct payload", async () => {
    const t = createConvexTest();
    
    await t.mutation(async (ctx) => {
      // Your email sending logic here
    });
  });
});
```

---

## Testing @convex-dev/presence

### Unit Tests for Presence Functions

```typescript
// convex/__tests__/presence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createConvexTest } from "./helpers";
import { api } from "../_generated/api";

describe("presence", () => {
  describe("heartbeat", () => {
    it("should register user in room", async () => {
      const t = createConvexTest();
      
      const sessionId = "session_123";
      const roomId = "test-room";
      const userId = "user_123";

      await t.mutation(api.presence.heartbeat, {
        roomId,
        userId,
        sessionId,
        interval: 5000,
      });

      // Verify user is in room
      const presenceList = await t.query(api.presence.list, {
        roomToken: roomId,
      });

      expect(presenceList).toContainEqual(
        expect.objectContaining({
          userId,
          sessionId,
        }),
      );
    });

    it("should update lastSeen timestamp on subsequent heartbeats", async () => {
      const t = createConvexTest();
      
      const sessionId = "session_123";
      const roomId = "test-room";
      const userId = "user_123";

      // First heartbeat
      await t.mutation(api.presence.heartbeat, {
        roomId,
        userId,
        sessionId,
        interval: 5000,
      });

      const firstList = await t.query(api.presence.list, {
        roomToken: roomId,
      });
      const firstSeen = firstList[0]?.lastSeen;

      // Wait and send second heartbeat
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await t.mutation(api.presence.heartbeat, {
        roomId,
        userId,
        sessionId,
        interval: 5000,
      });

      const secondList = await t.query(api.presence.list, {
        roomToken: roomId,
      });
      const secondSeen = secondList[0]?.lastSeen;

      expect(secondSeen).toBeGreaterThan(firstSeen);
    });
  });

  describe("disconnect", () => {
    it("should remove user from room", async () => {
      const t = createConvexTest();
      
      const sessionId = "session_123";
      const sessionToken = "token_123";
      const roomId = "test-room";
      const userId = "user_123";

      // Register user
      await t.mutation(api.presence.heartbeat, {
        roomId,
        userId,
        sessionId,
        interval: 5000,
      });

      // Verify user is present
      const beforeList = await t.query(api.presence.list, {
        roomToken: roomId,
      });
      expect(beforeList.length).toBe(1);

      // Disconnect
      await t.mutation(api.presence.disconnect, {
        sessionToken,
      });

      // Verify user is removed
      const afterList = await t.query(api.presence.list, {
        roomToken: roomId,
      });
      expect(afterList.length).toBe(0);
    });
  });
});
```

### React Hook Tests

```typescript
// src/components/presence/__tests__/Presence.test.tsx
import { describe, it, expect, render, screen, waitFor } from "@testing-library/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { PresenceTestComponent } from "../PresenceTestComponent";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

describe("usePresence hook", () => {
  it("should show users in room", async () => {
    render(
      <ConvexProvider client={convex}>
        <PresenceTestComponent roomId="test-room" userId="user_123" />
      </ConvexProvider>,
    );

    // Wait for presence to load
    await waitFor(() => {
      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });
  });

  it("should update when user joins", async () => {
    const { rerender } = render(
      <ConvexProvider client={convex}>
        <PresenceTestComponent roomId="test-room" userId="user_123" />
      </ConvexProvider>,
    );

    // Simulate another user joining
    rerender(
      <ConvexProvider client={convex}>
        <PresenceTestComponent roomId="test-room" userId="user_456" />
      </ConvexProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("user-presence")).toHaveLength(2);
    });
  });
});
```

---

## Testing Convex + Automerge Integration

### Testing Board Publishing Flow

```typescript
// convex/__tests__/board-publish-integration.test.ts
import { describe, it, expect } from "vitest";
import { createConvexTest, createTestUser } from "./helpers";
import { api, internal } from "../_generated/api";
import type { BoardDocument } from "../../src/lib/documents";

describe("board publish integration", () => {
  it("should publish Automerge board to Convex", async () => {
    const t = createConvexTest();
    
    // Create user
    const userId = await createTestUser(t, { username: "testuser" });

    // Simulate Automerge document snapshot
    const automergeSnapshot: Partial<BoardDocument> = {
      id: "board_123",
      name: "My Tier List",
      description: "Test board",
      tiers: [
        {
          id: "tier_s",
          name: "S Tier",
          label: "S",
          color: "#ff6b6b",
          itemIds: ["item_1", "item_2"],
          createdAt: Date.now(),
        },
      ],
      items: [
        {
          id: "item_1",
          name: "Item 1",
          imageId: "img_1",
          metadata: {},
          createdAt: Date.now(),
          createdBy: userId,
        },
      ],
      settings: {
        allowPublicJoin: true,
        requirePassword: false,
        maxPeers: 10,
        theme: "auto" as const,
      },
    };

    // Publish to Convex
    const result = await t.mutation(api.boards.publish, {
      title: automergeSnapshot.name!,
      description: automergeSnapshot.description,
      category: "gaming",
      tagIds: [],
      tierData: {
        tiers: automergeSnapshot.tiers,
        items: automergeSnapshot.items,
      },
      itemCount: automergeSnapshot.items!.length,
      tierCount: automergeSnapshot.tiers!.length,
      visibility: "public",
    });

    // Verify board was created
    expect(result.boardId).toBeDefined();
    expect(result.slug).toBe("my-tier-list");

    // Verify workflow was triggered
    const alerts = await t.query(api.alerts.list, {});
    // Alerts should be created for followers
  });
});
```

---

## E2E Tests with Playwright

### Workflow E2E Test

```typescript
// tests/e2e/workflow.test.ts
import { test, expect } from "@playwright/test";

test.describe("Workflow E2E", () => {
  test("should send email when board is published", async ({ page }) => {
    // Sign in
    await page.goto("/");
    await page.click('[data-testid="sign-in"]');
    
    // Create board
    await page.goto("/board/new");
    await page.fill('[data-testid="board-name"]', "E2E Test Board");
    
    // Add tiers and items
    await page.click('[data-testid="add-tier"]');
    await page.fill('[data-testid="tier-name"]', "S Tier");
    
    // Publish board
    await page.click('[data-testid="publish-button"]');
    
    // Wait for publish to complete
    await expect(page.locator('[data-testid="publish-success"]')).toBeVisible();
    
    // Verify workflow ran (check for success message or notification)
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      "Board published successfully",
    );
  });

  test("should show real-time presence updates", async ({ page, context }) => {
    // Open first tab
    await page.goto("/room/test-room");
    await page.fill('[data-testid="username"]', "User 1");
    await page.click('[data-testid="join-room"]');
    
    // Open second tab
    const page2 = await context.newPage();
    await page2.goto("/room/test-room");
    await page2.fill('[data-testid="username"]', "User 2");
    await page2.click('[data-testid="join-room"]');
    
    // Both pages should see each other
    await expect(page.locator('[data-testid="online-users"]')).toContainText("User 2");
    await expect(page2.locator('[data-testid="online-users"]')).toContainText("User 1");
    
    // Close second tab
    await page2.close();
    
    // First page should update
    await expect(page.locator('[data-testid="online-users"]')).not.toContainText("User 2");
  });
});
```

---

## Test Coverage Goals

| Component | Unit Tests | Integration Tests | E2E Tests |
|-----------|-----------|------------------|-----------|
| Workflows | ✅ 90% | ✅ 80% | ✅ Critical paths |
| Resend | ✅ 90% | ✅ 70% | ✅ Email sending |
| Presence | ✅ 90% | ✅ 80% | ✅ Real-time updates |
| Board Publish | ✅ 85% | ✅ 90% | ✅ Full flow |
| User Sync | ✅ 95% | ✅ 85% | ✅ Sign-in flow |

---

## Running Tests

```bash
# Run all tests
bun test

# Run Convex tests only
bun test convex

# Run with coverage
bun test --coverage

# Run E2E tests
bun test:e2e

# Run specific test file
bun test convex/__tests__/workflows.test.ts

# Watch mode
bun test --watch
```

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v2
      
      - run: bun install
      
      - name: Run unit tests
        run: bun test --coverage
      
      - name: Run E2E tests
        run: bun test:e2e
        env:
          CONVEX_URL: ${{ secrets.CONVEX_URL }}
          CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `convexTest` not loading schema | Ensure schema is imported correctly: `import schema from "../schema"` |
| Workflow steps not executing | Mock internal mutations/actions before starting workflow |
| Resend test mode not working | Set `testMode: false` explicitly and use `delivered@resend.dev` |
| Presence not updating | Ensure heartbeat interval is shorter than timeout (default 30s) |
| Auth not working in tests | Use `t.setAuth()` to mock Clerk identity |
