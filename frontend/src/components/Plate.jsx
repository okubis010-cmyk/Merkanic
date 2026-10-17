const formatPlate = (k = "") => {
  const groups = k.match(/[A-Z]+|\d+/g) || [k];
  return groups.length > 1 ? groups.join("-") : k;
};

export const Plate = ({ kenteken, size = "md", testid }) => {
  const big = size === "lg";
  return (
    <div data-testid={testid} className="inline-flex items-stretch overflow-hidden rounded-[5px] border-2 border-slate-900 bg-[#FACC15] text-slate-900 shadow-sm select-none">
      <div className={`bg-[#1D4ED8] text-white flex items-end justify-center font-bold leading-none ${big ? "px-2 pb-1.5 text-xs" : "px-1 pb-1 text-[9px]"}`}>NL</div>
      <span className={`font-plate font-extrabold tracking-widest ${big ? "px-4 py-1.5 text-2xl" : "px-2.5 py-0.5 text-sm"}`}>{formatPlate(kenteken)}</span>
    </div>
  );
};
