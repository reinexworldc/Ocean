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
  get_signal: 'Signal Agent',
  compare_arc_token: 'Token Comparison',
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

const ETH_GAS_MULTIPLIER = 340;

function formatSavings(value) {
  if (value >= 10) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
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

const SIGNAL_LABELS = { buy: 'BUY', sell: 'SELL', hold: 'HOLD' };

function SignalAgentItem({ action }) {
  const [expanded, setExpanded] = useState(false);
  const summary = action.summary ?? {};
  const signal = typeof summary.signal === 'string' ? summary.signal : null;
  const confidence = typeof summary.confidence === 'number' ? summary.confidence : null;
  const reasoning = typeof summary.reasoning === 'string' ? summary.reasoning : null;
  const innerTx = typeof summary.settlementTransaction === 'string' ? summary.settlementTransaction : null;
  const innerTxUrl = txUrlForArcTestnet(innerTx);
  const outerTxUrl = txUrlForArcTestnet(action.settlementTransaction);

  return (
    <li className="agent-actions-item agent-actions-item--signal">
      <div className="agent-actions-item-row">
        <button
          type="button"
          className={`agent-actions-item-expand ${expanded ? 'agent-actions-item-expand--open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="agent-actions-item-label">Signal Agent</span>
        {action.tokenId ? <span className="agent-actions-item-token">{action.tokenId}</span> : null}

        {signal && !expanded ? (
          <span className={`signal-badge signal-badge--${signal}`}>{SIGNAL_LABELS[signal] ?? signal.toUpperCase()}</span>
        ) : null}

        {outerTxUrl ? (
          <a
            className="agent-actions-item-tx"
            href={outerTxUrl}
            target="_blank"
            rel="noreferrer"
            title={action.settlementTransaction}
            onClick={(e) => e.stopPropagation()}
          >
            Tx
          </a>
        ) : null}

        <span className="agent-actions-item-price">{action.amountUsd ?? '—'}</span>
      </div>

      {expanded ? (
        <div className="signal-agent-panel">
          {/* A2A payment chain */}
          <div className="signal-chain">
            <span className="signal-chain-node signal-chain-node--you">You</span>
            <span className="signal-chain-edge">
              <span className="signal-chain-amount">{action.amountUsd}</span>
              <svg className="signal-chain-arrow-svg" width="24" height="10" viewBox="0 0 24 10" fill="none" aria-hidden="true">
                <path d="M0 5H20M20 5L15 1M20 5L15 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="signal-chain-node signal-chain-node--agent">
              Signal Agent
              {outerTxUrl ? (
                <a href={outerTxUrl} target="_blank" rel="noreferrer" className="signal-chain-tx" onClick={(e) => e.stopPropagation()}>↗</a>
              ) : null}
            </span>
            <span className="signal-chain-edge">
              <span className="signal-chain-amount">$0.01</span>
              <svg className="signal-chain-arrow-svg" width="24" height="10" viewBox="0 0 24 10" fill="none" aria-hidden="true">
                <path d="M0 5H20M20 5L15 1M20 5L15 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="signal-chain-node signal-chain-node--api">
              Token Profile
              {innerTxUrl ? (
                <a href={innerTxUrl} target="_blank" rel="noreferrer" className="signal-chain-tx" onClick={(e) => e.stopPropagation()}>↗</a>
              ) : null}
            </span>
          </div>

          {/* Signal result */}
          {signal !== null ? (
            <div className="signal-result">
              <span className={`signal-badge signal-badge--lg signal-badge--${signal}`}>
                {SIGNAL_LABELS[signal] ?? signal.toUpperCase()}
              </span>
              {confidence !== null ? (
                <div className="signal-confidence">
                  <div className="signal-confidence-track">
                    <div className="signal-confidence-fill" style={{ width: `${Math.round(confidence * 100)}%` }} />
                  </div>
                  <span className="signal-confidence-pct">{Math.round(confidence * 100)}%</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Reasoning */}
          {reasoning ? (
            <p className="signal-reasoning">{reasoning}</p>
          ) : null}
        </div>
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

  const ethSavings = totalUsd * (ETH_GAS_MULTIPLIER - 1);

  return (
    <div className="agent-actions-panel">
      <div className="agent-actions-header">
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

        <div className="agent-actions-savings" title={`On Ethereum the same calls would cost ~${formatSavings(totalUsd * ETH_GAS_MULTIPLIER)}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="agent-actions-savings-icon">
            <path d="M5 1L6.2 3.6L9 4L7 5.9L7.5 9L5 7.6L2.5 9L3 5.9L1 4L3.8 3.6L5 1Z" fill="currentColor" />
          </svg>
          <span>Saved <strong>~{formatSavings(ethSavings)}</strong> vs Ethereum</span>
        </div>
      </div>

      {expanded ? (
        <ul className="agent-actions-list">
          {actions.map((action, index) =>
            action.type === 'get_signal' ? (
              <SignalAgentItem key={`${action.type}-${action.tokenId ?? ''}-${index}`} action={action} />
            ) : (
              <ActionItem key={`${action.type}-${action.tokenId ?? ''}-${index}`} action={action} index={index} />
            )
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default AgentActionsPanel;
