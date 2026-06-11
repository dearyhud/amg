import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useAuditEvents, type AuditFilters } from "@/api/queries/audit";
import type { AuditEvent } from "@/api/schemas";
import { DecisionBadge } from "@/components/decision-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, shortRequestId } from "@/lib/format";

const columnHelper = createColumnHelper<AuditEvent>();

const columns = [
  columnHelper.accessor("created_at", {
    header: "Time",
    cell: (info) => (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {formatDateTime(info.getValue())}
      </span>
    ),
    size: 150,
  }),
  columnHelper.accessor("decision", {
    header: "Decision",
    cell: (info) => <DecisionBadge decision={info.getValue()} />,
    size: 130,
  }),
  columnHelper.accessor("tool", {
    header: "Tool",
    cell: (info) => <span className="truncate font-mono text-xs">{info.getValue()}</span>,
    size: 230,
  }),
  columnHelper.accessor("agent_name", {
    header: "Agent",
    cell: (info) => (
      <span className="truncate font-mono text-xs text-muted-foreground">{info.getValue()}</span>
    ),
    size: 190,
  }),
  columnHelper.accessor("role_name", {
    header: "Role",
    cell: (info) => (
      <span className="truncate font-mono text-xs text-muted-foreground">{info.getValue()}</span>
    ),
    size: 130,
  }),
  columnHelper.accessor("latency_ms", {
    header: "Latency",
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {value == null ? "—" : `${value}ms`}
        </span>
      );
    },
    size: 80,
  }),
  columnHelper.accessor("request_id", {
    header: "Request",
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground">
        {shortRequestId(info.getValue())}
      </span>
    ),
    size: 90,
  }),
];

const ROW_HEIGHT = 34;
const FETCH_AHEAD_PX = 400;

/*
 * Virtualized + keyset-paginated: the client never holds more than the
 * fetched window, and scroll position drives fetchNextPage.
 */
export function AuditTable({ filters }: { filters: AuditFilters }) {
  const navigate = useNavigate();
  const query = useAuditEvents(filters);
  const events = useMemo(
    () => query.data?.pages.flatMap((page) => page.events) ?? [],
    [query.data],
  );

  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (
        hasNextPage &&
        !isFetchingNextPage &&
        el.scrollHeight - el.scrollTop - el.clientHeight < FETCH_AHEAD_PX
      ) {
        void fetchNextPage();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <p className="text-sm text-destructive">Failed to load audit events.</p>;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex border-b px-2 text-xs font-medium text-muted-foreground">
        {table.getFlatHeaders().map((header) => (
          <div key={header.id} className="px-2 py-2" style={{ width: header.getSize() }}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="h-[calc(100vh-280px)] min-h-80 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No events match these filters.
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]!;
              return (
                <div
                  key={row.id}
                  data-testid="audit-row"
                  className="absolute left-0 flex w-full cursor-pointer items-center border-b border-border/60 px-2 transition-colors hover:bg-secondary/40"
                  style={{ top: virtualRow.start, height: ROW_HEIGHT }}
                  onClick={() =>
                    navigate({
                      to: "/audit/$eventId",
                      params: { eventId: String(row.original.id) },
                    })
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className="overflow-hidden px-2"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
