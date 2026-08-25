import { ProfileAvatar } from "@/components/profile-avatar";

export function AssigneeStack({
  assignees,
  size = 22,
  max = 3,
}: {
  assignees: { name: string; avatarUrl: string | null }[];
  size?: number;
  max?: number;
}) {
  if (!assignees.length) {
    return <span className="assignee-stack-empty">Sem responsável</span>;
  }

  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;

  return (
    <span className="assignee-stack" aria-label={assignees.map((item) => item.name).join(", ")}>
      {visible.map((assignee, index) => (
        <ProfileAvatar key={`${assignee.name}-${index}`} className="assignee" name={assignee.name} src={assignee.avatarUrl} size={size} />
      ))}
      {overflow > 0 && <span className="assignee-overflow">+{overflow}</span>}
    </span>
  );
}
