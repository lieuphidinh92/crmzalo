# Research: ZCA-JS Message & Conversation Structure

**Date:** 2026-03-26

---

## Message Types (cmd codes in WebSocket)

| cmd | Type | Class | Description |
|-----|------|-------|-------------|
| 501 | User Message | `UserMessage` | Tin nhắn cá nhân (1-1) |
| 521 | Group Message | `GroupMessage` | Tin nhắn nhóm |
| 612 | Reaction | `Reaction` | React emoji |
| 602 | Typing | `UserTyping` / `GroupTyping` | Đang gõ |
| 502 | Seen/Delivered (User) | `UserSeenMessage` / `UserDeliveredMessage` | Đã xem/nhận |
| 522 | Seen/Delivered (Group) | `GroupSeenMessage` / `GroupDeliveredMessage` | Đã xem/nhận |
| 601 | Control Events | — | Upload, group events, friend events |

## Message Object Structure

### `message.type` (ThreadType enum)
```typescript
enum ThreadType {
  User = 0,   // Tin nhắn cá nhân
  Group = 1,  // Tin nhắn nhóm
}
```

### `UserMessage` (cmd 501)
```typescript
{
  type: ThreadType.User,          // = 0
  threadId: string,               // UID của người kia (contact)
  isSelf: boolean,                // true nếu TÔI gửi
  data: {
    msgId: string,                // ID tin nhắn
    cliMsgId: string,             // Client message ID
    uidFrom: string,              // UID người gửi (= own UID nếu isSelf)
    idTo: string,                 // UID người nhận
    dName: string,                // ⚠️ Display name của NGƯỜI GỬI trên Zalo
    ts: string,                   // Timestamp (ms, string)
    content: string | object,     // Nội dung tin nhắn
    msgType: string,              // "chat.photo", "chat.sticker", "webchat", etc.
    quote: TQuote | undefined,    // Tin nhắn được reply
    ttl: number,                  // Time to live
    status: number,
  }
}
```

### `GroupMessage` (cmd 521)
```typescript
{
  type: ThreadType.Group,         // = 1
  threadId: string,               // ⚠️ Group ID (= data.idTo)
  isSelf: boolean,
  data: {
    // Tất cả fields của UserMessage +
    mentions: TMention[],         // Tag người trong nhóm
    // threadId = data.idTo = GROUP ID
    // data.uidFrom = UID NGƯỜI GỬI trong nhóm
    // data.dName = TÊN NGƯỜI GỬI
  }
}
```

### Key difference: threadId
- **UserMessage:** `threadId = uidFrom` (UID của contact, KHÔNG phải group)
- **GroupMessage:** `threadId = idTo` (GROUP ID)

## User Info Structure (getUserInfo API)

```typescript
type User = {
  userId: string,        // Zalo UID
  displayName: string,   // ⚠️ Tên TÔI đặt cho người này (alias)
  zaloName: string,      // ⚠️ Tên CHÍNH THỨC trên Zalo (do họ tự đặt)
  avatar: string,        // Avatar URL
  phoneNumber: string,   // SĐT
  gender: Gender,        // 0=Male, 1=Female
  dob: number,           // Ngày sinh
  status: string,        // Bio/status text
  isFr: number,          // 1=bạn bè, 0=không
  username: string,      // Username Zalo (nếu có)
}
```

### ⚠️ CRITICAL: `displayName` vs `zaloName`
- **`zaloName`** = Tên người dùng TỰ ĐẶT trên Zalo (tên chính thức, đồng bộ)
- **`displayName`** = Tên TÔI ĐẶT cho họ (alias/nickname, có thể khác)
- **`dName`** (trong message) = tên hiển thị khi chat, thường = `zaloName`

**→ Để đồng bộ đúng với Zalo app: dùng `zaloName`, KHÔNG dùng `displayName`**

## Group Info Structure (getGroupInfo API)

```typescript
type GroupInfo = {
  groupId: string,       // Group ID
  name: string,          // ⚠️ Tên nhóm
  desc: string,          // Mô tả nhóm
  type: GroupType,       // 1=Group, 2=Community
  avt: string,           // Avatar nhóm URL
  totalMember: number,   // Tổng thành viên
  creatorId: string,     // UID người tạo
  adminIds: string[],    // UID các admin
  memberIds: string[],   // UID tất cả thành viên
  currentMems: [{
    id: string,          // UID thành viên
    dName: string,       // Display name
    zaloName: string,    // ⚠️ Tên Zalo chính thức
    avatar: string,      // Avatar
  }],
}
```

## Content Types (msgType field)

| msgType | Loại | content format |
|---------|------|----------------|
| `"webchat"` | Text thường | `string` |
| `"chat.photo"` | Ảnh | `{ thumb, hdUrl, originUrl, width, height }` |
| `"chat.sticker"` | Sticker | `{ id, cateId, type }` |
| `"chat.video.msg"` | Video | `{ thumb, url, duration }` |
| `"chat.voice"` | Voice | `{ url, duration }` |
| `"chat.gif"` | GIF | `{ thumb, url, width, height }` |
| `"chat.location"` | Vị trí | `{ lat, lng, desc }` |
| `"chat.link"` | Link | `{ href, thumb, title, description }` |
| `"chat.recommended"` | Card liên hệ | `{ phone, name }` |
| `"chat.todo"` | Todo/Task | `{ params: { item } }` |

## Mapping hiện tại vs Cần sửa

### Hiện tại (CRM message-handler.ts):
```typescript
senderName: message.data?.dName || ''  // ❌ dName có thể trống
content: typeof message.data?.content === 'string' ? ... : JSON.stringify(...)
contentType: 'text'  // ❌ Luôn hardcode 'text'
```

### Cần sửa:
```typescript
// 1. Lấy tên chính xác — dùng getUserInfo lấy zaloName
// 2. Phân biệt User vs Group message
threadType: message.type === 0 ? 'user' : 'group'

// 3. externalThreadId phải khác:
//    User: = UID của contact (message.threadId)
//    Group: = Group ID (message.threadId = message.data.idTo)

// 4. Content type detection:
contentType = detectContentType(message.data.msgType, message.data.content)

// 5. Sender name: gọi getUserInfo → dùng zaloName
```

## API calls cần dùng

```typescript
// Lấy thông tin user (bao gồm zaloName)
const userInfo = await api.getUserInfo(userId);
// → userInfo.changed_profiles[userId].zaloName

// Lấy thông tin nhóm
const groupInfo = await api.getGroupInfo(groupId);
// → groupInfo.gridInfoMap[groupId].name (tên nhóm)
// → groupInfo.gridInfoMap[groupId].currentMems (thành viên)

// Lấy danh sách bạn bè
const friends = await api.getAllFriends();

// Lấy danh sách nhóm
const groups = await api.getAllGroups();
```

## Recommended Changes

1. **message-handler.ts**: Detect `message.type` (0=User, 1=Group) → set `threadType` correctly
2. **message-handler.ts**: Use `getUserInfo` to get `zaloName` instead of `dName`
3. **message-handler.ts**: Detect `contentType` from `msgType` field
4. **zalo-pool.ts**: Cache user info (zaloName, avatar) to avoid API calls per message
5. **Conversation model**: Use `threadType: 'user' | 'group'` properly
6. **Frontend**: Show group conversations differently (group icon, member names)
7. **Contact**: Store both `zaloName` (official) and `displayName` (alias) — display `zaloName` by default
