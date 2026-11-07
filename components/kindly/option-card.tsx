import { Icon } from "./icon";

/** A checkbox styled as a card with a title and description. */
export function OptionCard({ name, title, desc, defaultChecked, radio, value }: { name: string; title: string; desc?: string; defaultChecked?: boolean; radio?: boolean; value?: string }) {
  return (
    <label className={`option ${radio ? "option--radio" : ""}`}>
      <input type={radio ? "radio" : "checkbox"} name={name} value={value} defaultChecked={defaultChecked} />
      <span className="option__box">
        <Icon name="check" />
      </span>
      <span>
        <span className="option__title" style={{ display: "block" }}>
          {title}
        </span>
        {desc && (
          <span className="option__desc" style={{ display: "block" }}>
            {desc}
          </span>
        )}
      </span>
    </label>
  );
}
