import { useQuery } from "@tanstack/react-query";
import { baseClient } from "@/api/baseClient";
import { normalizeResortRules } from "@/data/resortRules";

export function useResortRules() {
  const query = useQuery({
    queryKey: ["resort-rules"],
    queryFn: () => baseClient.entities.ResortRule.list("sort_order", 100),
  });

  return {
    ...query,
    rules: normalizeResortRules(query.data),
  };
}