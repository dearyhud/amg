import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        // auth failures are a state, not a flake
        if (error instanceof Error && "status" in error && error.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

// MSW powers dev mode end to end; production talks to the real admin API.
async function enableMocking() {
  if (!import.meta.env.DEV && import.meta.env.VITE_MOCK !== "1") return;
  const { worker } = await import("./mocks/browser");
  await worker.start({
    serviceWorker: { url: "/admin/mockServiceWorker.js" },
    onUnhandledRequest: "bypass",
  });
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
