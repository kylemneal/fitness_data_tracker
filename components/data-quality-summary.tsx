"use client";

import type { DataQualityResponse } from "@/lib/types";

export function DataQualitySummary({ data }: { data: DataQualityResponse | undefined }) {
  if (!data || (data.summary.length === 0 && data.samples.length === 0)) {
    return (
      <section className="panel">
        <h2>Data Quality</h2>
        <p>No warnings recorded for the latest import run.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Data Quality</h2>
      <div className="quality-grid">
        {data.summary.map((summary) => (
          <article key={summary.warningType} className="quality-card">
            <h3>{summary.warningType}</h3>
            <p>{summary.count} warning(s)</p>
          </article>
        ))}
      </div>

      <details>
        <summary>Show warning samples</summary>
        <div className="warning-table-wrap">
          <table className="warning-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Message</th>
                <th>Metric</th>
                <th>Start</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {data.samples.map((sample, index) => (
                <tr key={`${sample.warningType}-${index}`}>
                  <td>{sample.warningType}</td>
                  <td>{sample.message}</td>
                  <td>{sample.metricType ?? "-"}</td>
                  <td>{sample.startTs ?? "-"}</td>
                  <td>{sample.rawValue ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
