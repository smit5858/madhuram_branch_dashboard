import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import branchService from "@/services/branch-service";
import type { IBranchModel } from "@/models/Branch";

// Large enough to load every branch in one request for dropdowns
const ALL_BRANCHES_PAGE_SIZE = 1000;

/** Loads all branches from the Branch API, for branch dropdowns */
export const useBranchOptions = () => {
    const { data, isFetching, isError } = useQuery({
        queryKey: ["branch-options"],
        queryFn: () => branchService.branch({ page: 1, pageSize: ALL_BRANCHES_PAGE_SIZE }),
        select: (response): IBranchModel[] => response?.data?.data?.branch ?? [],
    });

    const branches = useMemo(() => data ?? [], [data]);

    return { branches, isLoading: isFetching, isError };
};
