export function AgentThinkingDots() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="text-brand-400 text-lg animate-dotPulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          >
            ◈
          </span>
        ))}
      </div>
      <span className="text-xs font-mono font-medium text-secondary tracking-widest uppercase">
        Bureau Agents Processing
      </span>
    </div>
  );
}
