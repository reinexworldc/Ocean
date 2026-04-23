import { useState } from 'react';
import './AgentActionsPanel.css';

const ACTION_LABELS = {
  get_market_overview: 'Get Market Situation',
  get_token_profile: 'Get Token Profile',
  get_token_erc20: 'Get Token Contract',
  get_token_transfers: 'Get Token Transfers',
  get_token_holders: 'Get Token Holders',
  get_token_history: 'Get Token History',
  get_wallet_portfolio: 'Get Wallet Portfolio',
};

function parseAmountUsd(raw) {
  if (typeof raw === 'string' && raw.startsWith('$')) {
    return parseFloat(raw.slice(1));
  }
  if (typeof raw === 'number') {
    return raw;
  }
  return 0;
}

function formatUsd(value) {
  return `$${value.toFixed(2)}`;
}

function txUrlForArcTestnet(txHash) {
  if (!txHash || typeof txHash !== 'string') return null;
  const trimmed = txHash.trim();
  if (!trimmed) return null;
  return `https://testnet.arcscan.app/tx/${trimmed}`;
}

function getRpcBreakdown(action) {
  const summary = action.summary;
  if (!summary || typeof summary !== 'object') return null;
  const breakdown = summary.rpcBreakdown;
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  return breakdown;
}

function ActionItem({ action, index }) {
  const [rpcExpanded, setRpcExpanded] = useState(false);
  const breakdown = getRpcBreakdown(action);
  const rpcTotalCost = action.summary?.rpcTotalCost ?? null;

  return (
    <li key={`${action.type}-${index}`} className="agent-actions-item">
      <div className="agent-actions-item-row">
        {breakdown ? (
          <button
            type="button"
            className={`agent-actions-item-expand ${rpcExpanded ? 'agent-actions-item-expand--open' : ''}`}
            onClick={() => setRpcExpanded((v) => !v)}
            aria-expanded={rpcExpanded}
            title="Show RPC call breakdown"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="agent-actions-item-expand-placeholder" />
        )}

        <span className="agent-actions-item-label">
          {ACTION_LABELS[action.type] ?? action.type}
        </span>
        {action.tokenId ? <span className="agent-actions-item-token">{action.tokenId}</span> : null}

        {action.settlementTransaction ? (
          <a
            className="agent-actions-item-tx"
            href={txUrlForArcTestnet(action.settlementTransaction)}
            target="_blank"
            rel="noreferrer"
            title={action.settlementTransaction}
            onClick={(e) => e.stopPropagation()}
          >
            Tx
          </a>
        ) : null}

        <span className="agent-actions-item-price">
          {rpcTotalCost ?? action.amountUsd ?? '—'}
        </span>
      </div>

      {rpcExpanded && breakdown ? (
        <ul className="agent-actions-rpc-list">
          {breakdown.map((call, i) => (
            <li key={i} className="agent-actions-rpc-item">
              <span className="agent-actions-rpc-label">{call.label}</span>
              <span className="agent-actions-rpc-cost">{call.costUsd}</span>
            </li>
          ))}
          {rpcTotalCost ? (
            <li className="agent-actions-rpc-total">
              <span>Total RPC cost</span>
              <span>{rpcTotalCost}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function AgentActionsPanel({ actions }) {
  const [expanded, setExpanded] = useState(false);

  if (!actions || actions.length === 0) {
    return null;
  }

  const totalUsd = actions.reduce((sum, a) => {
    const rpcCost = a.summary?.rpcTotalCost;
    return sum + parseAmountUsd(rpcCost ?? a.amountUsd);
  }, 0);

  return (
    <div className="agent-actions-panel">
      <button
        type="button"
        className={`agent-actions-summary ${expanded ? 'agent-actions-summary--expanded' : ''}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="agent-actions-arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 4.5L6 8L10 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span className="agent-actions-count">{actions.length} API Call{actions.length !== 1 ? 's' : ''}</span>

        <span className="agent-actions-separator" aria-hidden="true" />

        <span className="agent-actions-total">{formatUsd(totalUsd)}</span>
      </button>

      {expanded ? (
        <ul className="agent-actions-list">
          {actions.map((action, index) => (
            <ActionItem key={`${action.type}-${action.tokenId ?? ''}-${index}`} action={action} index={index} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default AgentActionsPanel;
