export type Dataset = {
  id: string;
  label: string;
  values: (number | null)[];
};

export type SeriesBlock = {
  id: string;
  title: string;
  type: "series";
  kind?: "line" | "bar" | "area";
  x_axis?: "category" | "date";
  labels: string[];
  datasets: Dataset[];
  unit?: string;
};

export type SeriesState = {
  hidden_series?: string[];
  series_view?: "plot" | "table";
};
