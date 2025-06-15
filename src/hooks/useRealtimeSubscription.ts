
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeSubscriptionProps {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  callback: (payload: any) => void;
  filter?: string;
}

// Fixes typing error with Supabase Realtime - see https://github.com/supabase/supabase-js/issues/822
export const useRealtimeSubscription = ({
  table,
  event,
  callback,
  filter,
}: UseRealtimeSubscriptionProps) => {
  useEffect(() => {
    // Supabase Realtime API: use "postgres_changes" event at channel level ("schema-db-changes" is the recommended channel name for table updates)
    // TypeScript types might not recognize 'postgres_changes' as valid, so cast as any to bypass error
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes' as any,
        {
          event,
          schema: 'public',
          table,
          filter, // filter is optional and can be undefined
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, callback, filter]);
};
