import React, { useEffect, useMemo, useState } from "react";
import "./Holidays.css";
import { FaCalendarAlt } from "react-icons/fa";
import { toastSuccess, toastError } from "@/components/common/toast/toastService";
import api from "../api/axiosInstance";
import { API_ENDPOINTS } from "../api/endpoints";
import AppDatePicker from "../components/AppDatePicker";
import TruncatedText from "../components/TruncatedText";
import { extractCollection, sortByDateAsc } from "../utils/collections";
import {
  formatDate,
  getDayName,
  getTodayInputValue,
  toIsoDateString,
} from "../utils/date";
import { getStoredToken } from "../utils/authStorage";

const EMPTY_HOLIDAY = {
  id: null,
  name: "",
  date: "",
  day: "",
  type: "",
};

function Holidays() {
  const token = getStoredToken();

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [newHoliday, setNewHoliday] = useState(EMPTY_HOLIDAY);

  const todayString = useMemo(() => {
    return getTodayInputValue();
  }, []);

  const fetchHolidays = async () => {
    try {
      const res = await api.get(API_ENDPOINTS.company.holidays.list, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const formatted = sortByDateAsc(
        extractCollection(res.data).filter(
          (item) =>
            item.holiday_Name &&
            item.holiday_Name.trim() !== "" &&
            item.holiday_Date !== "0001-01-01T00:00:00"
        ),
        (item) => item.holiday_Date
      ).map((item) => ({
        id: item.id,
        name: item.holiday_Name,
        date: item.holiday_Date ? item.holiday_Date.split("T")[0] : "",
        day: item.day || "",
        type: item.type || "",
      }));

      setHolidays(formatted);
    } catch (err) {
      console.error("Fetch error:", err);
      toastError("Failed to load holidays.");
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const validateField = (name, draft = newHoliday) => {
    const value = String(draft[name] ?? "").trim();

    if (name === "name") {
      if (!value) return "Holiday Name is required";
      if (value.length < 2) return "Holiday Name must be at least 2 characters";
      return "";
    }

    if (name === "date") {
      if (!value) return "Date is required";
      if (!editMode && value < todayString) return "Date cannot be in the past";
      return "";
    }

    if (name === "type") {
      return value ? "" : "Type is required";
    }

    return "";
  };

  const validateForm = (draft = newHoliday) => {
    const nextErrors = {
      name: validateField("name", draft),
      date: validateField("date", draft),
      type: validateField("type", draft),
    };

    const cleanedErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(([, message]) => message)
    );

    setErrors(cleanedErrors);
    return Object.keys(cleanedErrors).length === 0;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === "date") {
      const day = getDayName(value, "");

      const draft = {
        ...newHoliday,
        date: value,
        day,
      };

      setNewHoliday(draft);
      setErrors((prev) => ({
        ...prev,
        date: validateField("date", draft),
      }));
      return;
    }

    const draft = {
      ...newHoliday,
      [name]: name === "name" ? value.replace(/^\s+/g, "") : value,
    };

    setNewHoliday(draft);
    setErrors((prev) => ({
      ...prev,
      [name]: validateField(name, draft),
    }));
  };

  const closeModal = () => {
    if (saving) return;

    setShowHolidayModal(false);
    setEditMode(false);
    setErrors({});
    setNewHoliday(EMPTY_HOLIDAY);
  };

  const handleSaveHoliday = async () => {
    const trimmedHoliday = {
      ...newHoliday,
      name: newHoliday.name.trim().replace(/\s+/g, " "),
      type: newHoliday.type.trim(),
    };

    setNewHoliday(trimmedHoliday);

    if (!validateForm(trimmedHoliday)) return;

    const payload = {
      holiday_Name: trimmedHoliday.name,
      holiday_Date: toIsoDateString(trimmedHoliday.date),
      day: trimmedHoliday.day,
      type: trimmedHoliday.type,
    };

    try {
      setSaving(true);

      if (editMode) {
        await api.put(
          API_ENDPOINTS.company.holidays.byId(trimmedHoliday.id),
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
      } else {
        await api.post(API_ENDPOINTS.company.holidays.list, payload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }

      toastSuccess(editMode ? "Holiday updated successfully." : "Holiday added successfully.");
      closeModal();
      await fetchHolidays();
    } catch (error) {
      console.error("Save error:", error);
      toastError("Unable to save holiday.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (holiday) => {
    setNewHoliday({
      id: holiday.id,
      name: holiday.name,
      date: holiday.date,
      day: holiday.day,
      type: holiday.type,
    });

    setErrors({});
    setEditMode(true);
    setShowHolidayModal(true);
  };

  const handleDelete = async () => {
    try {
      await api.delete(API_ENDPOINTS.company.holidays.byId(holidayToDelete.id), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      toastSuccess("Holiday deleted successfully.");
      setHolidayToDelete(null);
      await fetchHolidays();
    } catch (error) {
      console.error("Delete error:", error);
      toastError("Unable to delete holiday.");
    }
  };

  return (
    <div className="holiday-page holiday-page--admin">
<div className="holiday-header">
        <div className="holiday-header-copy">
          <h2>Company Holidays</h2>
          <p>{holidays.length} Holidays This Year</p>
        </div>

        <button
          className="holiday-add-btn"
          type="button"
          onClick={() => {
            closeModal();
            setShowHolidayModal(true);
          }}
        >
          + Add Holiday
        </button>
      </div>

      <div className="holiday-table-wrapper app-table-scroll">
        <table className="holiday-table holiday-table--admin">
          <colgroup>
            <col className="holiday-width-sno" />
            <col className="holiday-width-name" />
            <col className="holiday-width-date" />
            <col className="holiday-width-day" />
            <col className="holiday-width-type" />
            <col className="holiday-width-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="holiday-col-sno">S.No</th>
              <th className="holiday-col-name">Holiday Name</th>
              <th className="holiday-col-date">Date</th>
              <th className="holiday-col-day">Day</th>
              <th className="holiday-col-type">Type</th>
              <th className="holiday-col-actions">Actions</th>
            </tr>
          </thead>

          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan="6" className="app-table-empty-cell">
                  No holidays available.
                </td>
              </tr>
            ) : (
              holidays.map((holiday, index) => (
                <tr key={holiday.id}>
                  <td className="holiday-col-sno">{index + 1}</td>

                  <td className="holiday-col-name">
                    <div className="holiday-name-cell" title={holiday.name}>
                      <FaCalendarAlt className="holiday-icon" />
                      <TruncatedText className="holiday-name-text" value={holiday.name} />
                    </div>
                  </td>

                  <td className="holiday-col-date">{formatDate(holiday.date)}</td>
                  <td className="holiday-col-day">{holiday.day}</td>
                  <td className="holiday-col-type">{holiday.type}</td>
                  <td className="holiday-col-actions">
                    <div className="holiday-action-cell">
                      <button
                        className="edit-btn app-action-button app-action-button--edit"
                        type="button"
                        aria-label={`Edit ${holiday.name}`}
                        onClick={() => handleEdit(holiday)}
                      >
                        Edit
                      </button>

                      <button
                        className="delete-btn app-action-button app-action-button--delete"
                        type="button"
                        aria-label={`Delete ${holiday.name}`}
                        onClick={() => setHolidayToDelete(holiday)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showHolidayModal && (
        <div className="holiday-modal-overlay">
          <div className="holiday-modal-box">
            <h3>{editMode ? "Edit Holiday" : "Add Holiday"}</h3>

            <div className="holiday-field-group">
              <label htmlFor="holiday-name-input">Holiday Name</label>
              <input
                id="holiday-name-input"
                name="name"
                value={newHoliday.name}
                onChange={handleChange}
                className={errors.name ? "has-error" : ""}
              />
              {errors.name && <p className="holiday-form-error">{errors.name}</p>}
            </div>

            <div className="holiday-field-group">
              <label htmlFor="holiday-date-input">Date</label>
              <AppDatePicker
                id="holiday-date-input"
                name="date"
                minDate={editMode ? undefined : todayString}
                value={newHoliday.date}
                onChange={handleChange}
                className={errors.date ? "has-error" : ""}
                ariaInvalid={Boolean(errors.date)}
                ariaDescribedBy={errors.date ? "holiday-date-error" : undefined}
              />
              <p className="holiday-field-helper">
                {newHoliday.date ? formatDate(newHoliday.date) : "Format: DD/MM/YYYY"}
              </p>
              {errors.date && (
                <p id="holiday-date-error" className="holiday-form-error">
                  {errors.date}
                </p>
              )}
            </div>

            <div className="holiday-field-group">
              <label htmlFor="holiday-day-input">Day</label>
              <input id="holiday-day-input" name="day" value={newHoliday.day} readOnly />
            </div>

            <div className="holiday-field-group">
              <label htmlFor="holiday-type-select">Type</label>
              <select
                id="holiday-type-select"
                name="type"
                value={newHoliday.type}
                onChange={handleChange}
                className={errors.type ? "has-error" : ""}
              >
                <option value="">Select Type</option>
                <option value="National">National</option>
                <option value="Festival">Festival</option>
                <option value="Company">Company</option>
              </select>
              {errors.type && <p className="holiday-form-error">{errors.type}</p>}
            </div>

            <div className="holiday-modal-btns">
              <button
                className="holiday-cancel-btn"
                
                type="button"
                onClick={closeModal}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="holiday-save-btn"
                type="button"
                onClick={handleSaveHoliday}
                disabled={saving}
              >
                {saving ? (editMode ? "Updating..." : "Saving...") : editMode ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {holidayToDelete && (
        <div className="holiday-modal-overlay">
          <div className="holiday-modal-box">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete this holiday?</p>

            <div className="holiday-modal-btns">
              <button
                className="holiday-cancel-btn"
                type="button"
                onClick={() => setHolidayToDelete(null)}
              >
                Cancel
              </button>

              <button className="holiday-delete-btn" type="button" onClick={handleDelete}>
                Yes Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Holidays;
