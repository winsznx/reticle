import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Landing from "./pages/Landing";

const Make = lazy(() => import("./pages/Make"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Piece = lazy(() => import("./pages/Piece"));
const Proof = lazy(() => import("./pages/Proof"));
const Embed = lazy(() => import("./pages/Embed"));

const NotFound = () => <div className="wrap" style={{ padding: "64px 0" }}><h2>Nothing here</h2></div>;

export default function App() {
  return (
    <Suspense fallback={<div className="wrap" style={{ padding: 48 }} />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="make" element={<Make />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="piece/:id" element={<Piece />} />
          <Route path="proof" element={<Proof />} />
          <Route path="embed" element={<Embed />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
