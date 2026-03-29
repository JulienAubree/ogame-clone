import { useState } from 'react';
import { useLocation } from 'react-router';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackForm } from './FeedbackForm';

export function FloatingFeedbackButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Hide on the feedback page itself
  if (location.pathname.startsWith('/feedback')) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 lg:bottom-4"
        title="Envoyer un feedback"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </button>
      <FeedbackForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}
