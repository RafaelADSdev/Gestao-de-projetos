"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { CreateWorkItemModal } from "@/components/projects/create-work-item-modal";

type EpicOption = { id: string; name: string; clientName: string };
type MemberOption = { id: string; name: string };
type SprintOption = { id: string; name: string };

export function BoardCreateCardButton({
  epics,
  members,
  sprints,
  defaultSprintId = null,
}: {
  epics: EpicOption[];
  members: MemberOption[];
  sprints: SprintOption[];
  defaultSprintId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={17} /> Novo card
      </button>
      <CreateWorkItemModal
        open={open}
        onClose={close}
        epics={epics}
        members={members}
        sprints={sprints}
        defaultSprintId={defaultSprintId}
      />
    </>
  );
}
