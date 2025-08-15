import { useState, useEffect } from 'react';
import { Coins, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

export function CreditTransactions() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (showTransactions && user) {
      fetchTransactions();
    }
  }, [showTransactions, user]);

  const fetchTransactions = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount, transaction_type, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${Number(amount).toFixed(1)}`;
  };

  const getTransactionColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowTransactions(!showTransactions)}
        className="w-full flex items-center justify-between p-2 h-auto text-xs"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3" />
          <span>Transaction History</span>
        </div>
        {showTransactions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {showTransactions && (
        <div className="border border-sidebar-border rounded-lg bg-sidebar-accent/50">
          <ScrollArea className="h-48">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Loading transactions...
                </div>
              ) : transactions.length > 0 ? (
                transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between py-1 border-b border-sidebar-border/50 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {transaction.description || transaction.transaction_type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(transaction.created_at)}
                      </div>
                    </div>
                    <div className={`text-xs font-medium flex items-center gap-1 ${getTransactionColor(transaction.amount)}`}>
                      <Coins className="h-3 w-3" />
                      {formatAmount(transaction.amount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No transactions yet
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}