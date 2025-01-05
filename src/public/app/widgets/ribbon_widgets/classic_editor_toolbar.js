import { t } from "../../services/i18n.js";
import options from "../../services/options.js";
import utils from "../../services/utils.js";
import NoteContextAwareWidget from "../note_context_aware_widget.js";

const TPL = `\
<div class="classic-toolbar-widget"></div>

<style>
    .classic-toolbar-widget {
        --ck-color-toolbar-background: transparent;
        --ck-color-button-default-background: transparent;
        --ck-color-button-default-disabled-background: transparent;
        min-height: 39px;
    }

    .classic-toolbar-widget .ck.ck-toolbar {
        border: none;
    }

    .classic-toolbar-widget .ck.ck-button.ck-disabled {
        opacity: 0.3;
    }

    body.mobile .classic-toolbar-widget {
        display: none;
    }

    body.mobile .classic-toolbar-widget.visible {
        display: flex;
        align-items: flex-end;
        position: absolute;
        left: 0;
        bottom: 0;
        right: 0;
        overflow-x: auto;
        z-index: 500;
        user-select: none;
    }

    body.mobile .classic-toolbar-widget.dropdown-active {
        height: 50vh;
    }

    body.mobile .classic-toolbar-widget .ck.ck-toolbar {
        position: absolute;
        background-color: var(--main-background-color);
    }

    body.mobile .classic-toolbar-widget .ck.ck-dropdown__panel {
        bottom: 100% !important;
        top: unset !important;
    }
</style>
`;

/**
 * Handles the editing toolbar when the CKEditor is in decoupled mode.
 *
 * <p>
 * This toolbar is only enabled if the user has selected the classic CKEditor.
 *
 * <p>
 * The ribbon item is active by default for text notes, as long as they are not in read-only mode.
 */
export default class ClassicEditorToolbar extends NoteContextAwareWidget {

    constructor() {
        super();
        this.observer = new MutationObserver((e) => this.#onDropdownStateChanged(e));
    }

    get name() {
        return "classicEditor";
    }

    get toggleCommand() {
        return "toggleRibbonTabClassicEditor";
    }

    doRender() {
        this.$widget = $(TPL);
        this.contentSized();

        if (utils.isMobile()) {
            // The virtual keyboard obscures the editing toolbar so we have to reposition by calculating the height of the keyboard.
            window.visualViewport.addEventListener("resize", () => this.#adjustPosition());
            window.addEventListener("scroll", () => this.#adjustPosition());

            // Observe when a dropdown is expanded to apply a style that allows the dropdown to be visible, since we can't have the element both visible and the toolbar scrollable.
            this.observer.disconnect();
            this.observer.observe(this.$widget[0], {
                attributeFilter: [ "aria-expanded" ],
                subtree: true
            });
        }
    }

    #onDropdownStateChanged(e) {
        const dropdownActive = e
            .map((e) => e.target.ariaExpanded === "true")
            .reduce((acc, e) => acc && e);
        this.$widget[0].classList.toggle("dropdown-active", dropdownActive);
    }

    #adjustPosition() {
        const bottom = window.innerHeight - window.visualViewport.height;
        this.$widget.css("bottom", `${bottom}px`);
    }

    async getTitle() {
        return {
            show: await this.#shouldDisplay(),
            activate: true,
            title: t("classic_editor_toolbar.title"),
            icon: "bx bx-text"
        };
    }

    async #shouldDisplay() {
        if (options.get("textNoteEditorType") !== "ckeditor-classic") {
            return false;
        }

        if (this.note.type !== "text") {
            return false;
        }

        if (await this.noteContext.isReadOnly()) {
            return false;
        }

        return true;
    }

}
