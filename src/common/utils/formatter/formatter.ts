/*
 * Copyright 2015-2016 Imply Data, Inc.
 * Copyright 2017-2018 Allegro.pl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Duration, Timezone } from "chronoshift";
import * as numbro from "numbro";
import { NumberRange, TimeRange } from "plywood";
import { STRINGS } from "../../../client/config/constants";
import { Dimension } from "../../models/dimension/dimension";
import {
  FilterClause,
  FixedTimeFilterClause,
  isTimeFilter,
  NumberFilterClause,
  StringFilterAction,
  StringFilterClause,
  TimeFilterClause,
  TimeFilterPeriod
} from "../../models/filter-clause/filter-clause";
import { Filter } from "../../models/filter/filter";
import { Measure } from "../../models/measure/measure";
import { SeriesFormat, SeriesFormatType } from "../../models/series/series";
import { Unary } from "../functional/functional";
import { DisplayYear, formatTimeRange } from "../time/time";

export function formatFnFactory(format: string): (n: number) => string {
  return (n: number) => {
    if (isNaN(n) || !isFinite(n)) return "-";
    return numbro(n).format(format);
  };
}

export const exactFormat = "0,0";
const exactFormatter = formatFnFactory(exactFormat);
export const percentFormat = "0[.]00%";
const percentFormatter = formatFnFactory(percentFormat);

export function seriesFormatter(format: SeriesFormat, measure: Measure): Unary<number, string> {
  switch (format.type) {
      case SeriesFormatType.DEFAULT:
        return measure.formatFn;
      case SeriesFormatType.EXACT:
        return exactFormatter;
      case SeriesFormatType.PERCENT:
        return percentFormatter;
      case SeriesFormatType.CUSTOM:
        return formatFnFactory(format.value);
    }
}

export function formatNumberRange(value: NumberRange) {
  return `${formatValue(value.start || "any")} to ${formatValue(value.end || "any")}`;
}

export function formatValue(value: any, timezone?: Timezone, displayYear?: DisplayYear): string {
  if (NumberRange.isNumberRange(value)) {
    return formatNumberRange(value);
  } else if (TimeRange.isTimeRange(value)) {
    return formatTimeRange(value, timezone, displayYear);
  } else {
    return "" + value;
  }
}

export function formatFilterClause(dimension: Dimension, clause: FilterClause, timezone: Timezone): string {
  const { title, values } = this.getFormattedClause(dimension, clause, timezone);
  return title ? `${title} ${values}` : values;
}

function getFormattedStringClauseValues({ values, action }: StringFilterClause): string {
  switch (action) {
    case StringFilterAction.MATCH:
      return `/${values.first()}/`;
    case StringFilterAction.CONTAINS:
      return `"${values.first()}"`;
    case StringFilterAction.IN:
      return values.count() > 1 ? `(${values.count()})` : values.first();
  }
}

function getFilterClauseValues(clause: FilterClause, timezone: Timezone): string {
  if (isTimeFilter(clause)) {
    return getFormattedTimeClauseValues(clause, timezone);
  }
  if (clause instanceof StringFilterClause) {
    return getFormattedStringClauseValues(clause);
  }
  if (clause instanceof NumberFilterClause) {
    const { start, end } = clause.values.first();
    return `${start} to ${end}`;
  }
  return clause.values.first().toString();
}

function getClauseLabel(clause: FilterClause, dimension: Dimension) {
  const dimensionTitle = dimension.title;
  if (isTimeFilter(clause)) return "";
  const delimiter = clause instanceof StringFilterClause && [StringFilterAction.MATCH, StringFilterAction.CONTAINS].indexOf(clause.action) !== -1 ? " ~" : ":";

  const clauseValues = clause.values;
  if (clauseValues && clauseValues.count() > 1) return `${dimensionTitle}`;
  return `${dimensionTitle}${delimiter}`;
}

export function getFormattedClause(dimension: Dimension, clause: FilterClause, timezone: Timezone): { title: string, values: string } {
  return { title: getClauseLabel(clause, dimension), values: getFilterClauseValues(clause, timezone) };
}

function getFormattedTimeClauseValues(clause: TimeFilterClause, timezone: Timezone): string {
  if (clause instanceof FixedTimeFilterClause) {
    return formatTimeRange(TimeRange.fromJS(clause.values.get(0)), timezone, DisplayYear.IF_DIFF);
  }
  const { period, duration } = clause;
  switch (period) {
    case TimeFilterPeriod.PREVIOUS:
      return `${STRINGS.previous} ${getQualifiedDurationDescription(duration)}`;
    case TimeFilterPeriod.CURRENT:
      return `${STRINGS.current} ${getQualifiedDurationDescription(duration)}`;
    case TimeFilterPeriod.LATEST:
      return `${STRINGS.latest} ${getQualifiedDurationDescription(duration)}`;
  }
}

function getQualifiedDurationDescription(duration: Duration) {
  if (duration.toString() === "P3M") {
    return STRINGS.quarter.toLowerCase();
  } else {
    return duration.getDescription();
  }
}

function dateToFileString(date: Date): string {
  return date.toISOString()
    .replace("T", "_")
    .replace("Z", "")
    .replace(".000", "");
}

export function getFileString(filter: Filter): string {
  const timeFilter: FixedTimeFilterClause = filter.clauses.find(clause => clause instanceof FixedTimeFilterClause) as FixedTimeFilterClause;
  const nonTimeClauseSize = filter.clauses.filter(clause => !(clause instanceof FixedTimeFilterClause)).count();
  const filtersPart = nonTimeClauseSize === 0 ? "" : `_filters-${nonTimeClauseSize}`;
  if (timeFilter) {
    const { start, end } = timeFilter.values.first();
    return `${dateToFileString(start)}_${dateToFileString(end)}${filtersPart}`;
  }
  return filtersPart;
}
