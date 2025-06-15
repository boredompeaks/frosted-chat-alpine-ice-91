
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
  filter,
}: UseRealtimeSubscriptionProps) => {
  useEffect(() => {
    // The new Realtime API expects the event handlers for database changes to be under "db", not the default system types
    // The correct event is "postgres_changes" and you must use the "schema-db-changes" as channel name
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter,
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, callback, filter]);
};
