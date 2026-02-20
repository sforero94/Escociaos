import { Toaster as Sonner } from "sonner";

const Toaster = () => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      richColors
      position="top-right"
      toastOptions={{
        duration: 8000,
      }}
    />
  );
};

export { Toaster };
