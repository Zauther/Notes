import OptionsWidget from "../options_widget.js";
import utils from "../../../../services/utils.js";
import { t } from "../../../../services/i18n.js";

const MIN_VALUE = 640;

const TPL = `
<div class="options-section">
    <h4>${t("max_content_width.title")}</h4>

    <p>${t("max_content_width.default_description")}</p>

    <div class="form-group row">
        <div class="col-md-6">
            <label for="max-content-width">${t("max_content_width.max_width_label")}</label>
            <input id="max-content-width" type="number" min="${MIN_VALUE}" step="10" class="max-content-width form-control options-number-input">
        </div>
    </div>

    <p>
        ${t("max_content_width.apply_changes_description")}
        <button class="btn btn-micro reload-frontend-button">${t("max_content_width.reload_button")}</button>
    </p>
</div>`;

export default class MaxContentWidthOptions extends OptionsWidget {
    doRender() {
        this.$widget = $(TPL);

        this.$maxContentWidth = this.$widget.find(".max-content-width");

        this.$maxContentWidth.on('change', async () =>
            this.updateOption('maxContentWidth', this.$maxContentWidth.val()))

        this.$widget.find(".reload-frontend-button").on("click", () => utils.reloadFrontendApp(t("max_content_width.reload_description")));
    }

    async optionsLoaded(options) {
        this.$maxContentWidth.val(Math.max(MIN_VALUE, options.maxContentWidth));
    }
}
