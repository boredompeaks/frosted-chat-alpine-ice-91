
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeSubscriptionProps {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  callback: (payload: any) => void;
  filter?: string;
}

export const useRealtimeSubscription = ({
  table,
  event,
  callback,
  filter
}: UseRealtimeSubscriptionProps) => {
  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${table}:${event}`)
      .on('postgres_changes', {
        event,
        schema: 'public',
        table,
        filter
      }, callback)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, callback, filter]);
};
