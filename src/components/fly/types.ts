export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  bio: string;
  photoURL: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  gender?: string;
  pronoun?: string;
  country?: string;
  preferredLanguage?: string;
  followers: string[];
  following: string[];
  viewedStoryIds?: string[];
  /** Admin moderation: epoch ms until which the account is suspended (0 = active). */
  suspendedUntil?: number;
  suspendedReason?: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  createdAt: number;
  likes?: string[];
  replies?: Comment[];
  /** Commenter was a VIP subscriber of the post's creator. */
  vip?: boolean;
  /** For replies: the person being replied to (shown as a highlighted mention). */
  replyToId?: string;
  replyToName?: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto: string;
  text: string;
  mediaUrl: string;
  mediaType: string;
  /** Multiple photos/videos in one post (album). First item mirrors mediaUrl/mediaType. */
  media?: { url: string; type: string }[];
  /** Friends tagged in this post. */
  taggedUsers?: { uid: string; name: string }[];
  likes: string[];
  comments: Comment[];
  tags?: string[];
  bgStyle?: string;
  views?: number;
  shares?: number;
  /** Only visible to the creator's VIP subscribers. */
  exclusive?: boolean;
  /** Sponsored boost: pending request, approved (sponsored until boostUntil) or rejected. */
  boostStatus?: "pending" | "approved" | "rejected";
  boostDays?: number;
  boostUntil?: number;
  boostRequestedAt?: number;
  createdAt: number;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto: string;
  mediaUrl: string;
  mediaType: string;
  musicUrl?: string;
  musicName?: string;
  createdAt: number;
  reactions?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  kind: "text" | "call";
  mediaUrl: string;
  mediaType: string;
  mediaName: string;
  postId?: string;
  replyToId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  editedAt?: number;
  createdAt: number;
  deliveredTo: string[];
  seenBy: string[];
  deletedFor: string[];
  deleted: boolean;
  reactions?: Record<string, string>;
}



export interface GroupMember {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
}

export interface GroupConversation {
  id: string;
  type: "group";
  name: string;
  photoURL: string;
  participantIds: string[];
  members: GroupMember[];
  adminIds?: string[];
  /** When false, only admins can send messages, voice notes or start calls. */
  membersCanSend?: boolean;
  createdBy?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  type?: "direct" | "group";
  otherId: string;
  otherProfile: UserProfile;
  group?: GroupConversation;
  lastMessage: string;
  lastMessageAt: number;
  lastSenderId?: string;
}
