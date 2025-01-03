/**
 * @module
 *
 * Options are key-value pairs that are used to store information such as user preferences (for example
 * the current theme, sync server information), but also information about the state of the application.
 *
 * Although options internally are represented as strings, their value can be interpreted as a number or
 * boolean by calling the appropriate methods from this service (e.g. {@link #getOptionInt}).\
 *
 * Generally options are shared across multiple instances of the application via the sync mechanism,
 * however it is possible to have options that are local to an instance. For example, the user can select
 * a theme on a device and it will not affect other devices.
 */

import becca from "../becca/becca.js";
import BOption from "../becca/entities/boption.js";
import { OptionRow } from '../becca/entities/rows.js';
import { KeyboardActionNames } from "./keyboard_actions_interface.js";
import sql from "./sql.js";

/**
 * For each keyboard action, there is a corresponding option which identifies the key combination defined by the user.
 */
type KeyboardShortcutsOptions<T extends KeyboardActionNames> = {
    [key in T as `keyboardShortcuts${Capitalize<key>}`]: string
};

interface OptionDefinitions extends KeyboardShortcutsOptions<KeyboardActionNames> {
    "openNoteContexts": string;
    "lastDailyBackupDate": string;
    "lastWeeklyBackupDate": string;
    "lastMonthlyBackupDate": string;
    "dbVersion": string;
    "theme": string;
    "syncServerHost": string;
    "syncServerTimeout": string;
    "syncProxy": string;
    "mainFontFamily": string;
    "treeFontFamily": string;
    "detailFontFamily": string;
    "monospaceFontFamily": string;
    "spellCheckLanguageCode": string;
    "codeNotesMimeTypes": string;
    "headingStyle": string;
    "highlightsList": string;
    "customSearchEngineName": string;
    "customSearchEngineUrl": string;
    "locale": string;
    "codeBlockTheme": string;
    "textNoteEditorType": string;
    "layoutOrientation": string;
    "allowedHtmlTags": string;
    "documentId": string;
    "documentSecret": string;
    "passwordVerificationHash": string;
    "passwordVerificationSalt": string;
    "passwordDerivedKeySalt": string;
    "encryptedDataKey": string;

    "lastSyncedPull": number;
    "lastSyncedPush": number;
    "revisionSnapshotTimeInterval": number;
    "revisionSnapshotNumberLimit": number;
    "protectedSessionTimeout": number;
    "zoomFactor": number;
    "mainFontSize": number;
    "treeFontSize": number;
    "detailFontSize": number;
    "monospaceFontSize": number;
    "imageMaxWidthHeight": number;
    "imageJpegQuality": number;
    "leftPaneWidth": number;
    "rightPaneWidth": number;
    "eraseEntitiesAfterTimeInSeconds": number;
    "autoReadonlySizeText": number;
    "autoReadonlySizeCode": number;
    "maxContentWidth": number;
    "minTocHeadings": number;
    "eraseUnusedAttachmentsAfterSeconds": number;
    "firstDayOfWeek": number;

    "initialized": boolean;
    "overrideThemeFonts": boolean;
    "spellCheckEnabled": boolean;
    "autoFixConsistencyIssues": boolean;
    "vimKeymapEnabled": boolean;
    "codeLineWrapEnabled": boolean;
    "leftPaneVisible": boolean;
    "rightPaneVisible": boolean;
    "nativeTitleBarVisible": boolean;
    "hideArchivedNotes_main": boolean;
    "debugModeEnabled": boolean;
    "autoCollapseNoteTree": boolean;
    "dailyBackupEnabled": boolean;
    "weeklyBackupEnabled": boolean;
    "monthlyBackupEnabled": boolean;
    "compressImages": boolean;
    "downloadImagesAutomatically": boolean;
    "checkForUpdates": boolean;
    "disableTray": boolean;
    "promotedAttributesOpenInRibbon": boolean;
    "editedNotesOpenInRibbon": boolean;
    "codeBlockWordWrap": boolean;
    "textNoteEditorMultilineToolbar": boolean;
    "backgroundEffects": boolean;
};

export type OptionNames = keyof OptionDefinitions;

type FilterOptionsByType<U> = {
    [K in keyof OptionDefinitions]: OptionDefinitions[K] extends U ? K : never;
}[keyof OptionDefinitions];

/**
 * A dictionary where the keys are the option keys (e.g. `theme`) and their corresponding values.
 */
export type OptionMap = Record<OptionNames, string>;

function getOptionOrNull(name: OptionNames): string | null {
    let option;

    if (becca.loaded) {
        option = becca.getOption(name);
    } else {
        // e.g. in initial sync becca is not loaded because DB is not initialized
        option = sql.getRow<OptionRow>("SELECT * FROM options WHERE name = ?", [name]);
    }

    return option ? option.value : null;
}

function getOption(name: OptionNames) {
    const val = getOptionOrNull(name);

    if (val === null) {
        throw new Error(`Option '${name}' doesn't exist`);
    }

    return val;
}

function getOptionInt(name: FilterOptionsByType<number>, defaultValue?: number): number {
    const val = getOption(name);

    const intVal = parseInt(val);

    if (isNaN(intVal)) {
        if (defaultValue === undefined) {
            throw new Error(`Could not parse '${val}' into integer for option '${name}'`);
        } else {
            return defaultValue;
        }
    }

    return intVal;
}

function getOptionBool(name: FilterOptionsByType<boolean>): boolean {
    const val = getOption(name);

    if (typeof val !== "string" || !['true', 'false'].includes(val)) {
        throw new Error(`Could not parse '${val}' into boolean for option '${name}'`);
    }

    return val === 'true';
}

function setOption<T extends OptionNames>(name: T, value: string | OptionDefinitions[T]) {
    const option = becca.getOption(name);

    if (option) {
        option.value = value as string;

        option.save();
    }
    else {
        createOption(name, value, false);
    }
}

/**
 * Creates a new option in the database, with the given name, value and whether it should be synced.
 *
 * @param name the name of the option to be created.
 * @param value the value of the option, as a string. It can then be interpreted as other types such as a number of boolean.
 * @param isSynced `true` if the value should be synced across multiple instances (e.g. locale) or `false` if it should be local-only (e.g. theme).
 */
function createOption<T extends OptionNames>(name: T, value: string | OptionDefinitions[T], isSynced: boolean) {
    new BOption({
        name: name,
        value: value as string,
        isSynced: isSynced
    }).save();
}

function getOptions() {
    return Object.values(becca.options);
}

function getOptionMap() {
    const map: Record<string, string> = {};

    for (const option of Object.values(becca.options)) {
        map[option.name] = option.value;
    }

    return map as OptionMap;
}

export default {
    getOption,
    getOptionInt,
    getOptionBool,
    setOption,
    createOption,
    getOptions,
    getOptionMap,
    getOptionOrNull
};
