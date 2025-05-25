export const calculateUnits = (amount, nav) => {
  return nav > 0 ? (amount / nav).toFixed(4) : "";
};

export const calculateCAGR = (startNAV, endNAV, years) => {
  return endNAV && startNAV && years > 0
    ? (((endNAV / startNAV) ** (1 / years) - 1) * 100).toFixed(4)
    : "";
};

export const calculateYears = (dateString) => {
  try {
    let parsedDate;
    if (dateString.includes("-")) {
      parsedDate = new Date(dateString);
    } else {
      parsedDate = parse(dateString, "MM/dd/yyyy", new Date());
    }
    const currentDate = new Date();
    return (currentDate - parsedDate) / (1000 * 60 * 60 * 24 * 365);
  } catch (error) {
    console.error("Date parsing error:", error);
    return 0;
  }
};
