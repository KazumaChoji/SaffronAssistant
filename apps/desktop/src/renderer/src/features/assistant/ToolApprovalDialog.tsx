import { useState } from 'react';
import { useAssistant } from './useAssistant';

export function ToolApprovalDialog() {
  const { pendingApproval, approveToolUse, denyToolUse, modifyToolUse } =
    useAssistant();
  const [isEditing, setIsEditing] = useState(false);
  const [modifiedInput, setModifiedInput] = useState('');

  if (!pendingApproval) return null;

  const handleModify = () => {
    if (isEditing) {
      try {
        const parsed = JSON.parse(modifiedInput);
        modifyToolUse(parsed);
        setIsEditing(false);
      } catch (error) {
        alert('Invalid JSON. Please fix the input.');
      }
    } else {
      setModifiedInput(
        JSON.stringify(pendingApproval.tool_call.input, null, 2)
      );
      setIsEditing(true);
    }
  };

  const riskColors = {
    safe: 'bg-green-500/10 border-green-500/30 text-green-300',
    moderate: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
    dangerous: 'bg-red-500/10 border-red-500/30 text-red-300',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-panel rounded-xl shadow-glass max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.05] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-white">Tool Approval Required</h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                riskColors[pendingApproval.risk_level]
              }`}
            >
              {pendingApproval.risk_level}
            </span>
          </div>
          <p className="text-white/60 text-sm">
            The agent wants to use the following tool
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Tool info */}
          <div>
            <h3 className="font-medium text-white mb-1">
              {pendingApproval.tool_call.name}
            </h3>
            <p className="text-sm text-white/60">
              {pendingApproval.tool_definition.description}
            </p>
          </div>

          {/* Parameters */}
          <div>
            <h4 className="text-sm font-medium text-white/70 mb-2">
              Parameters:
            </h4>
            {isEditing ? (
              <textarea
                value={modifiedInput}
                onChange={(e) => setModifiedInput(e.target.value)}
                className="w-full h-48 p-3 font-mono text-sm bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:bg-black/30 focus:border-white/20"
              />
            ) : (
              <pre className="bg-black/20 border border-white/10 p-3 rounded-lg overflow-x-auto text-sm text-white/80">
                {JSON.stringify(pendingApproval.tool_call.input, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
          <button
            onClick={handleModify}
            className="glass-btn"
          >
            {isEditing ? 'Apply Changes' : 'Modify Parameters'}
          </button>

          <div className="flex space-x-3">
            <button
              onClick={denyToolUse}
              className="px-6 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={approveToolUse}
              className="px-6 py-2 bg-green-500/20 border border-green-500/30 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
