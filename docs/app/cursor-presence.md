Cursor Presence Implementation Plan

    1. Architecture Overview

      1 ┌─────────────────────────────────────────────────────────────────┐
      2 │                        Browser A (Host)                         │
      3 │  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    │
      4 │  │ useCursor   │───▶│ P2PNetwork   │───▶│ WebRTC Data     │    │
      5 │  │ Presence    │    │ .sendMessage │    │ Channel         │    │
      6 │  └─────────────┘    └──────────────┘    └────────┬────────┘    │
      7 └───────────────────────────────────────────────────┼─────────────┘
      8                                                     │
      9                                          (RTCDataChannel.send)
     10                                                     │
     11 ┌───────────────────────────────────────────────────┼─────────────┐
     12 │                        Browser B (Client)        ▼              │
     13 │  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐    │
     14 │  │ P2PNetwork   │───▶│ handleMessage│───▶│ CursorPresence  │    │
     15 │  │ .onmessage   │    │ "presence:   │    │ Event Emitter   │    │
     16 │  └──────────────┘    │  cursor"     │    └────────┬────────┘    │
     17 │                      └──────────────┘             │              │
     18 │  ┌────────────────────────────────────────────────▼────────┐    │
     19 │  │ useCursorPresence                                       │    │
     20 │  │ - remoteCursors: Map<peerId, CursorState>              │    │
     21 │  │ - lastUpdate: Map<peerId, timestamp>                   │    │
     22 │  └─────────────────────────────────────────────────────────┘    │
     23 └─────────────────────────────────────────────────────────────────┘

    ---

    2. Message Type Design

    File: `src/lib/p2p/types.ts`

      1 export const CursorPresenceSchema = z.object({
      2   type: z.literal("presence:cursor"),
      3   peerId: z.string().refine(cuidRefinement, "Invalid peer ID"),
      4   x: z.number(),
      5   y: z.number(),
      6   selection: z.object({
      7     startId: z.string().optional(),
      8     endId: z.string().optional(),
      9   }).optional(),
     10   timestamp: z.number(),
     11 });
     12
     13 export const PresenceBatchSchema = z.object({
     14   type: z.literal("presence:batch"),
     15   peerId: z.string(),
     16   cursors: z.array(CursorPresenceSchema),
     17   timestamp: z.number(),
     18 });
     19
     20 // Add to P2PMessageSchema union
     21 export const P2PMessageSchema = z.discriminatedUnion("type", [
     22   // ... existing types
     23   CursorPresenceSchema,
     24   PresenceBatchSchema,
     25 ]);

    Rationale:
     - presence:cursor - Individual cursor update (throttled)
     - presence:batch - Batch multiple cursors (if needed for performance)
     - Includes selection for highlighting active items
     - timestamp for stale data detection

    ---

    3. Rate Limiting Strategy

    File: `src/lib/p2p/rate-limiter.ts`

      1 // Add cursor-specific rate limiter
      2 export const cursorRateLimiter = rateLimit({
      3   interval: 100,  // 100ms = 10 updates/sec max per peer
      4   rate: 1,
      5 });
      6
      7 // In P2PNetwork, throttle cursor messages
      8 private cursorThrottle = new Throttle(100);  // 10fps max
      9
     10 sendCursorPresence(x: number, y: number, selection?: Selection) {
     11   // Throttle at source
     12   if (!this.cursorThrottle.canSend()) return;
     13
     14   this.sendMessage({
     15     type: "presence:cursor",
     16     peerId: this.id,
     17     x, y,
     18     selection,
     19     timestamp: Date.now(),
     20   });
     21 }

    Why 10fps?
     - Human eye perceives smooth motion at 10-12fps for cursors
     - Reduces network traffic by ~6x vs 60fps
     - Matches Figma/Miro cursor update rates

    ---

    4. Presence State Management

    File: `src/hooks/useCursorPresence.ts` (NEW)

       1 interface CursorState {
       2   peerId: string;
       3   peerName: string;
       4   x: number;
       5   y: number;
       6   selection?: { startId?: string; endId?: string };
       7   color: string;
       8   lastUpdate: number;
       9 }
      10
      11 interface UseCursorPresenceReturn {
      12   localCursor: { x: number; y: number } | null;
      13   remoteCursors: Map<string, CursorState>;
      14   sendCursor: (x: number, y: number, selection?: Selection) => void;
      15   setSelection: (startId?: string, endId?: string) => void;
      16 }
      17
      18 export function useCursorPresence(
      19   network: P2PNetwork | null,
      20   boardId: string
      21 ): UseCursorPresenceReturn {
      22   const [localCursor, setLocalCursor] = useState<{ x: number; y: number } | null>(null);
      23   const [remoteCursors, setRemoteCursors] = useState<Map<string, CursorState>>(new Map());
      24   const cursorTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
      25
      26   // Generate consistent color per peer
      27   const getPeerColor = useCallback((peerId: string) => {
      28     // Deterministic color from peerId hash
      29     const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
      30     const hash = peerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      31     return colors[hash % colors.length];
      32   }, []);
      33
      34   useEffect(() => {
      35     if (!network) return;
      36
      37     // Listen for remote cursor updates
      38     const handleCursor = (cursor: CursorPresenceMessage) => {
      39       setRemoteCursors(prev => {
      40         const next = new Map(prev);
      41         const peer = network.getPeers().find(p => p.id === cursor.peerId);
      42
      43         next.set(cursor.peerId, {
      44           peerId: cursor.peerId,
      45           peerName: peer?.name || 'Unknown',
      46           x: cursor.x,
      47           y: cursor.y,
      48           selection: cursor.selection,
      49           color: getPeerColor(cursor.peerId),
      50           lastUpdate: cursor.timestamp,
      51         });
      52
      53         // Clear stale cursor timeout
      54         const existingTimeout = cursorTimeoutRef.current.get(cursor.peerId);
      55         if (existingTimeout) clearTimeout(existingTimeout);
      56
      57         // Remove cursor after 5 seconds of inactivity
      58         const timeout = setTimeout(() => {
      59           setRemoteCursors(curr => {
      60             const cleaned = new Map(curr);
      61             cleaned.delete(cursor.peerId);
      62             return cleaned;
      63           });
      64           cursorTimeoutRef.current.delete(cursor.peerId);
      65         }, 5000);
      66
      67         cursorTimeoutRef.current.set(cursor.peerId, timeout);
      68         return next;
      69       });
      70     };
      71
      72     // Listen for peer leave - cleanup immediately
      73     const handlePeerLeft = (peer: PeerInfo) => {
      74       setRemoteCursors(prev => {
      75         const next = new Map(prev);
      76         next.delete(peer.id);
      77         return next;
      78       });
      79       const timeout = cursorTimeoutRef.current.get(peer.id);
      80       if (timeout) clearTimeout(timeout);
      81       cursorTimeoutRef.current.delete(peer.id);
      82     };
      83
      84     network.on('presence:cursor', handleCursor);
      85     network.on('peer:left', handlePeerLeft);
      86
      87     return () => {
      88       network.off('presence:cursor', handleCursor);
      89       network.off('peer:left', handlePeerLeft);
      90       // Cleanup all timeouts
      91       cursorTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      92       cursorTimeoutRef.current.clear();
      93     };
      94   }, [network, getPeerColor]);
      95
      96   // Send cursor update
      97   const sendCursor = useCallback((x: number, y: number, selection?: Selection) => {
      98     if (!network || network.getStatus() !== 'connected') return;
      99     network.sendCursorPresence(x, y, selection);
     100   }, [network]);
     101
     102   return {
     103     localCursor,
     104     remoteCursors,
     105     sendCursor,
     106     setSelection,
     107   };
     108 }

    Key Design Decisions:
     1. 5-second timeout - Cursors disappear after inactivity (prevents "ghost cursors")
     2. Immediate cleanup on peer leave - No stale cursors when peer disconnects
     3. Deterministic colors - Same peer always has same color
     4. Map-based storage - O(1) lookup/update per peer

    ---

    5. P2PNetwork Changes

    File: `src/lib/p2p/P2PNetwork.ts`

      1 // Add to class properties
      2 private cursorThrottle: Throttle;
      3
      4 constructor() {
      5   // ... existing init
      6   this.cursorThrottle = new Throttle(100);  // 100ms = 10fps
      7 }
      8
      9 // New method
     10 sendCursorPresence(x: number, y: number, selection?: { startId?: string; endId?: string }): void {
     11   if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
     12
     13   // Rate limit at source
     14   if (!this.cursorThrottle.canSend()) return;
     15
     16   try {
     17     this.dataChannel.send(JSON.stringify({
     18       type: 'presence:cursor',
     19       peerId: this.id,
     20       x,
     21       y,
     22       selection,
     23       timestamp: Date.now(),
     24     }));
     25   } catch (error) {
     26     // Silently ignore cursor errors (non-critical)
     27     if (process.env.NODE_ENV === 'development') {
     28       console.warn('Failed to send cursor presence:', error);
     29     }
     30   }
     31 }
     32
     33 // In handleMessage, add case
     34 case 'presence:cursor':
     35   this.emit('presence:cursor', message);
     36   break;
     37
     38 // In destroy/cleanup
     39 destroy(): void {
     40   this.cursorThrottle.dispose();
     41   // ... existing cleanup
     42 }

    Throttle Implementation:

      1 // src/lib/p2p/throttle.ts (NEW)
      2 export class Throttle {
      3   private interval: number;
      4   private lastSend: number = 0;
      5
      6   constructor(intervalMs: number) {
      7     this.interval = intervalMs;
      8   }
      9
     10   canSend(): boolean {
     11     const now = Date.now();
     12     if (now - this.lastSend >= this.interval) {
     13       this.lastSend = now;
     14       return true;
     15     }
     16     return false;
     17   }
     18
     19   dispose(): void {
     20     this.lastSend = 0;
     21   }
     22 }

    ---

    6. Connection Error Handling

    Potential ERR_CONNECTION_REFUSED scenarios:


    ┌──────────────────────────┬──────────────────────┬───────────────────────────────────────────┐
    │ Scenario                 │ Cause                │ Prevention                                │
    ├──────────────────────────┼──────────────────────┼───────────────────────────────────────────┤
    │ Data channel not open    │ Connection failed    │ Check readyState before send              │
    │ Peer disconnected        │ Network issue        │ Timeout-based cursor cleanup              │
    │ Message queue full       │ Overwhelming channel │ Rate limiting (10fps)                     │
    │ Browser tab backgrounded │ Throttled by browser │ Pause cursor sending on visibility change │
    └──────────────────────────┴──────────────────────┴───────────────────────────────────────────┘


    Implementation:

      1 // In useCursorPresence hook
      2 useEffect(() => {
      3   const handleVisibility = () => {
      4     if (document.hidden) {
      5       // Pause cursor updates when tab is hidden
      6       setIsPaused(true);
      7     } else {
      8       setIsPaused(false);
      9     }
     10   };
     11
     12   document.addEventListener('visibilitychange', handleVisibility);
     13   return () => document.removeEventListener('visibilitychange', handleVisibility);
     14 }, []);
     15
     16 // In sendCursor
     17 const sendCursor = useCallback((x: number, y: number) => {
     18   if (!network || network.getStatus() !== 'connected') return;
     19   if (isPaused) return;  // Don't send when tab hidden
     20
     21   // Check data channel state
     22   const channel = network.getDataChannel();
     23   if (!channel || channel.readyState !== 'open') return;
     24
     25   network.sendCursorPresence(x, y);
     26 }, [network, isPaused]);

    ---

    7. UI Component Plan

    File: `src/components/presence/CursorPresence.tsx` (NEW)

      1 interface CursorPresenceProps {
      2   remoteCursors: Map<string, CursorState>;
      3   containerRef: RefObject<HTMLElement>;
      4 }
      5
      6 export function CursorPresence({ remoteCursors, containerRef }: CursorPresenceProps) {
      7   return (
      8     <div className="pointer-events-none fixed inset-0 z-50">
      9       {Array.from(remoteCursors.values()).map((cursor) => (
     10         <Cursor
     11           key={cursor.peerId}
     12           cursor={cursor}
     13           containerRef={containerRef}
     14         />
     15       ))}
     16     </div>
     17   );
     18 }
     19
     20 interface CursorProps {
     21   cursor: CursorState;
     22   containerRef: RefObject<HTMLElement>;
     23 }
     24
     25 function Cursor({ cursor, containerRef }: CursorProps) {
     26   // Convert page coordinates to container-relative
     27   const containerRect = containerRef.current?.getBoundingClientRect();
     28   if (!containerRect) return null;
     29
     30   const x = cursor.x - containerRect.left;
     31   const y = cursor.y - containerRect.top;
     32
     33   return (
     34     <div
     35       className="absolute transition-transform duration-75 ease-out"
     36       style={{
     37         transform: `translate(${x}px, ${y}px)`,
     38         color: cursor.color,
     39       }}
     40     >
     41       {/* Cursor SVG */}
     42       <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
     43         <path d="M5.651 19.082l2.81-7.98 7.98 7.98-10.79.001zm1.414-1.414l6.95-.001-6.95-6.95-2.121 6.022
        2.12.93zm1.415-2.122l5.303-5.303 2.121 2.122-5.303 5.303-2.121-2.122z"/>
     44       </svg>
     45
     46       {/* Peer name label */}
     47       <div className="ml-3 mt-1 px-2 py-0.5 rounded text-xs font-medium text-white shadow-lg"
     48            style={{ backgroundColor: cursor.color }}>
     49         {cursor.peerName}
     50       </div>
     51
     52       {/* Selection highlight */}
     53       {cursor.selection && (
     54         <div className="absolute inset-0 border-2 rounded"
     55              style={{ borderColor: cursor.color, opacity: 0.3 }} />
     56       )}
     57     </div>
     58   );
     59 }

    CSS considerations:

      1 /* Smooth cursor movement */
      2 .cursor-presence {
      3   transition: transform 75ms ease-out;
      4   will-change: transform;
      5 }
      6
      7 /* Fade out stale cursors */
      8 .cursor-presence.stale {
      9   opacity: 0.5;
     10   transition: opacity 500ms ease-out;
     11 }

    ---

    8. Integration Points

    File: `src/routes/board.tsx` (or wherever board is rendered)

      1 export function BoardPage() {
      2   const { network } = useP2PNetwork();
      3   const { doc } = useBoardDocument(boardId, { network });
      4   const boardRef = useRef<HTMLDivElement>(null);
      5
      6   const {
      7     localCursor,
      8     remoteCursors,
      9     sendCursor,
     10   } = useCursorPresence(network, boardId);
     11
     12   // Track mouse movement
     13   useEffect(() => {
     14     const board = boardRef.current;
     15     if (!board || !network) return;
     16
     17     const handleMouseMove = (e: MouseEvent) => {
     18       setLocalCursor({ x: e.clientX, y: e.clientY });
     19       sendCursor(e.clientX, e.clientY);
     20     };
     21
     22     board.addEventListener('mousemove', handleMouseMove);
     23     return () => board.removeEventListener('mousemove', handleMouseMove);
     24   }, [network, sendCursor]);
     25
     26   return (
     27     <div ref={boardRef} className="relative">
     28       {/* Board content */}
     29       <TierList doc={doc} />
     30
     31       {/* Cursor presence overlay */}
     32       <CursorPresence
     33         remoteCursors={remoteCursors}
     34         containerRef={boardRef}
     35       />
     36     </div>
     37   );
     38 }

    ---

    9. Testing Strategy

    Unit Tests (`src/lib/p2p/__tests__/cursor-presence.test.ts`):

      1 describe('sendCursorPresence', () => {
      2   it('should throttle cursor updates to 10fps', () => {
      3     const network = new P2PNetwork();
      4     const sendSpy = vi.spyOn(network, 'sendMessage');
      5
      6     // Send 20 rapid updates
      7     for (let i = 0; i < 20; i++) {
      8       network.sendCursorPresence(i, i);
      9     }
     10
     11     // Should only send 2 (initial + 1 after throttle)
     12     expect(sendSpy).toHaveBeenCalledTimes(2);
     13   });
     14
     15   it('should not send when data channel is not open', () => {
     16     const network = new P2PNetwork();
     17     const sendSpy = vi.spyOn(network, 'sendMessage');
     18
     19     // Simulate closed channel
     20     network.setDataChannel({ readyState: 'closed' } as RTCDataChannel);
     21
     22     network.sendCursorPresence(100, 100);
     23     expect(sendSpy).not.toHaveBeenCalled();
     24   });
     25 });

    Integration Tests (`src/hooks/__tests__/useCursorPresence.test.tsx`):

      1 describe('useCursorPresence', () => {
      2   it('should clean up cursors after 5 seconds of inactivity', async () => {
      3     const { result } = renderHook(() => useCursorPresence(mockNetwork, boardId));
      4
      5     // Simulate receiving cursor
      6     mockNetwork.emit('presence:cursor', {
      7       peerId: 'peer-1',
      8       x: 100, y: 100,
      9       timestamp: Date.now(),
     10     });
     11
     12     expect(result.current.remoteCursors.has('peer-1')).toBe(true);
     13
     14     // Wait 5 seconds
     15     await act(async () => {
     16       await new Promise(r => setTimeout(r, 5000));
     17     });
     18
     19     // Cursor should be removed
     20     expect(result.current.remoteCursors.has('peer-1')).toBe(false);
     21   });
     22
     23   it('should immediately cleanup on peer leave', () => {
     24     const { result } = renderHook(() => useCursorPresence(mockNetwork, boardId));
     25
     26     mockNetwork.emit('presence:cursor', { peerId: 'peer-1', x: 100, y: 100, timestamp: Date.now() });
     27     expect(result.current.remoteCursors.has('peer-1')).toBe(true);
     28
     29     mockNetwork.emit('peer:left', { id: 'peer-1' });
     30     expect(result.current.remoteCursors.has('peer-1')).toBe(false);
     31   });
     32 });

    E2E Tests (`tests/e2e/cursor-presence.spec.ts`):

      1 test('cursor presence works across browsers', async ({ page, context }) => {
      2   // Open host
      3   const hostPage = await context.newPage();
      4   await hostPage.goto('/board/new');
      5   const roomCode = await hostPage.locator('[data-room-code]').textContent();
      6
      7   // Open client in new browser
      8   const clientPage = await chromium.launchPersistentContext().then(c => c.newPage());
      9   await clientPage.goto(`/board/join/${roomCode}`);
     10
     11   // Move cursor on host
     12   await hostPage.mouse.move(100, 100);
     13
     14   // Verify cursor appears on client
     15   await expect(clientPage.locator('[data-cursor]')).toBeVisible();
     16 });

    ---

    10. File Changes Summary


    ┌──────────────────────────────────────────┬────────────┬───────────────────────────────────────────────────┐
    │ File                                     │ Change ... │ Description                                       │
    ├──────────────────────────────────────────┼────────────┼───────────────────────────────────────────────────┤
    │ src/lib/p2p/types.ts                     │ Modify     │ Add CursorPresenceSchema, PresenceBatchSchema     │
    │ src/lib/p2p/P2PNetwork.ts                │ Modify     │ Add sendCursorPresence(), throttle, message ha... │
    │ src/lib/p2p/throttle.ts                  │ NEW        │ Throttle utility class                            │
    │ src/lib/p2p/rate-limiter.ts              │ Modify     │ Add cursor rate limiter                           │
    │ src/hooks/useCursorPresence.ts           │ NEW        │ Presence state management hook                    │
    │ `src/components/presence/CursorPresen... │ NEW        │ Cursor rendering component                        │
    │ src/components/presence/Cursor.tsx       │ NEW        │ Individual cursor component                       │
    │ src/routes/board.tsx                     │ Modify     │ Integrate cursor presence                         │
    │ `src/lib/p2p/__tests__/cursor-presence.te... │ NEW        │ Unit tests
     │
    │ `src/hooks/__tests__/useCursorPresence.te... │ NEW        │ Hook tests
     │
    │ tests/e2e/cursor-presence.spec.ts        │ NEW        │ E2E tests                                         │
    └──────────────────────────────────────────┴────────────┴───────────────────────────────────────────────────┘

    ---

    11. Risk Mitigation


    ┌──────────────────────┬────────────────────────────────────────────────┐
    │ Risk                 │ Mitigation                                     │
    ├──────────────────────┼────────────────────────────────────────────────┤
    │ ERR_CONNECTION_REFUSED │ Check dataChannel.readyState before every send │
    │ Network congestion   │ 10fps throttle + silent error handling         │
    │ Memory leaks         │ Timeout-based cleanup + peer leave cleanup     │
    │ Ghost cursors        │ 5-second inactivity timeout                    │
    │ Performance          │ will-change: transform + CSS transitions       │
    │ Background tab waste │ Visibility API pause                           │
    │ Color collisions     │ Deterministic hash-based colors                │
    └──────────────────────┴────────────────────────────────────────────────┘

    ---

    12. Implementation Order

     1. Phase 1: Core Infrastructure
        - Add message types to types.ts
        - Create throttle.ts
        - Add sendCursorPresence() to P2PNetwork.ts
        - Add message handler

     2. Phase 2: State Management
        - Create useCursorPresence.ts hook
        - Implement timeout-based cleanup
        - Add peer leave handling

     3. Phase 3: UI Components
        - Create CursorPresence.tsx
        - Create Cursor.tsx
        - Style cursors

     4. Phase 4: Integration
        - Update board.tsx
        - Add mouse tracking
        - Test with multiple browsers

     5. Phase 5: Testing
        - Unit tests
        - Integration tests
        - E2E tests