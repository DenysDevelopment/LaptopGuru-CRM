'use client';

// /allegro/conversations/[id] is the same conversation detail view as
// /messaging/conversations/[id] — the underlying component detects the
// URL prefix via usePathname() and adapts back-links/filters accordingly.
import ConversationDetailPage from '../../../messaging/conversations/[id]/page';

export default function AllegroConversationDetailPage() {
	return <ConversationDetailPage />;
}
