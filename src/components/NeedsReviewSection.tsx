import { useState, useEffect } from 'react';
import { supabaseClient } from '../supabaseClient';
import ProposalDiffModal from './ProposalDiffModal';

interface OrderChangeProposal {
  id: string;
  order_id: string | null; // NULL for new order proposals
  intake_event_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  orders: {
    id: string;
    customer_name: string;
    delivery_date: string;
    status: string;
    source_channel: string;
    order_lines: Array<{
      product_name: string;
      quantity: number;
    }>;
  } | null; // NULL for new order proposals
  intake_events: {
    channel: string;
    created_at: string;
  };
  order_change_proposal_lines?: Array<{
    id: string;
    item_name: string;
    proposed_values: any;
  }>;
}

export default function NeedsReviewSection() {
  const [proposals, setProposals] = useState<OrderChangeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<OrderChangeProposal | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchProposals();
  }, []);

  async function fetchProposals() {
    try {
      setLoading(true);
      const { data, error } = await supabaseClient
        .from('order_change_proposals')
        .select(`
          id,
          order_id,
          intake_event_id,
          status,
          created_at,
          orders (
            id,
            customer_name,
            delivery_date,
            status,
            source_channel,
            order_lines (
              product_name,
              quantity,
              status
            )
          ),
          intake_events (
            channel,
            created_at
          ),
          order_change_proposal_lines (
            id,
            item_name,
            proposed_values,
            change_type
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out deleted order lines
      const filteredData = (data || []).map(proposal => ({
        ...proposal,
        orders: proposal.orders ? {
          ...proposal.orders,
          order_lines: (proposal.orders.order_lines || []).filter((line: any) => line.status === 'active')
        } : null
      }));

      setProposals(filteredData);
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleProposalClick(proposal: OrderChangeProposal) {
    setSelectedProposal(proposal);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setSelectedProposal(null);
  }

  async function handleProposalResolved() {
    // Refresh the list after accepting/rejecting
    await fetchProposals();
    handleCloseModal();
  }

  if (loading) {
    return null;
  }

  if (proposals.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg mb-6 overflow-hidden">
        <div className="bg-yellow-100 px-4 py-3 border-b border-yellow-200">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-yellow-600 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h3 className="text-sm font-semibold text-yellow-800">
              {proposals.length} Order Change{proposals.length > 1 ? 's' : ''} Pending Review
            </h3>
          </div>
        </div>

        <div className="divide-y divide-yellow-200">
          {proposals.map((proposal) => {
            const getChannelIcon = (channel: string) => {
              if (channel === 'email') {
                return (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                );
              } else if (channel === 'sms') {
                return (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                );
              }
              return null;
            };

            // Check if this is a new order proposal (order_id is NULL)
            const isNewOrderProposal = !proposal.order_id;

            // Get items summary based on whether it's a new order or change
            let itemsSummary = '';
            let hasMoreItems = false;
            let customerName = '';
            let totalItemCount = 0;
            let deliveryDate = '';

            if (isNewOrderProposal) {
              // New order proposal - get data from proposal_lines
              const proposalLines = proposal.order_change_proposal_lines || [];
              itemsSummary = proposalLines
                .slice(0, 2)
                .map((line) => `${line.item_name} (${line.proposed_values?.quantity || 0})`)
                .join(', ');
              totalItemCount = proposalLines.length;
              hasMoreItems = proposalLines.length > 2;
              customerName = proposalLines[0]?.proposed_values?.customer_name || 'New Order';
              deliveryDate = proposalLines[0]?.proposed_values?.delivery_date || '';
            } else if (proposal.orders) {
              // Change proposal - get data from existing order
              itemsSummary = proposal.orders.order_lines
                .slice(0, 2)
                .map((line) => `${line.product_name} (${line.quantity})`)
                .join(', ');
              totalItemCount = proposal.orders.order_lines.length;
              hasMoreItems = proposal.orders.order_lines.length > 2;
              customerName = proposal.orders.customer_name;
              deliveryDate = proposal.orders.delivery_date;
            }

            return (
              <div
                key={proposal.id}
                onClick={() => handleProposalClick(proposal)}
                className="px-4 py-3 hover:bg-yellow-100 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Customer */}
                  <div className="min-w-0 flex-shrink-0" style={{ width: '180px' }}>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {customerName}
                      {isNewOrderProposal && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          New
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Received By */}
                  <div className="flex items-center gap-2 text-xs text-gray-600 flex-shrink-0">
                    {getChannelIcon(proposal.intake_events.channel)}
                    <span className="capitalize">{proposal.intake_events.channel}</span>
                  </div>

                  {/* Items */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 truncate">
                      {itemsSummary}
                      {hasMoreItems && (
                        <span className="text-gray-400">
                          {' '}
                          +{totalItemCount - 2} more
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Delivery Date */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {deliveryDate ? new Date(deliveryDate).toLocaleDateString() : 'No date'}
                    </span>
                  </div>

                  {/* Received At */}
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(proposal.intake_events.created_at).toLocaleString()}
                  </div>

                  {/* Review Button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-200 text-yellow-800">
                      Review
                    </span>
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && selectedProposal && (
        <ProposalDiffModal
          proposalId={selectedProposal.id}
          orderId={selectedProposal.order_id}
          onClose={handleCloseModal}
          onResolved={handleProposalResolved}
        />
      )}
    </>
  );
}
